// Copies evidence files from the Supabase "evidence" bucket to Cloudflare R2 under the SAME keys.
// Run from a developer machine, never from Vercel. Full procedure: docs/ops/free-tier-runbook.md.
//
// RECOMMENDED RUN ORDER
//   1. node scripts/migrate-evidence-to-r2.mjs inventory
//   2. Pilot one organisation (the trailing slash matters):
//        CONFIRM=yes-copy-evidence-to-r2 node scripts/migrate-evidence-to-r2.mjs copy --prefix=<orgId>/ --limit=50 --execute
//        CONFIRM=yes-flip-evidence-rows node scripts/migrate-evidence-to-r2.mjs flip --prefix=<orgId>/ --execute
//      Then check those photos in the admin UI.
//   3. CONFIRM=yes-copy-evidence-to-r2 node scripts/migrate-evidence-to-r2.mjs copy --execute
//   4. CONFIRM=yes-flip-evidence-rows node scripts/migrate-evidence-to-r2.mjs flip --execute
//   5. Check one May and one July photo in the admin UI, then wait at least a week.
//   6. node scripts/migrate-evidence-to-r2.mjs purge                  (dry run: read the numbers)
//   7. CONFIRM=yes-purge-supabase-evidence node scripts/migrate-evidence-to-r2.mjs purge --execute
//
// MODES
//   inventory  Read-only against both buckets. Writes local reports only.
//   copy       Copies objects missing from R2, verifying each by MD5. Never overwrites.
//   flip       Points visit_evidence rows at R2. Changes only storage_provider and bucket.
//   purge      DESTRUCTIVE. Deletes Supabase originals that pass every safety check.
//
// SAFETY
//   copy, flip and purge change nothing unless BOTH --execute and CONFIRM=<mode token> are present.
//   Every mode is resumable and idempotent. A Supabase HTTP 402 aborts the run (exit code 2).
//   Error output contains error names and HTTP statuses only, never credentials or endpoints.
//
// OPTIONS
//   --prefix=<p>  --limit=<n>  --concurrency=<n> (default 6, max 16)
//   --manifest=<path>  --grace-hours=<n> (default 168)  --execute
//
// ENVIRONMENT (names only; loaded from .env.local in the current directory if present)
//   R2_ACCOUNT_ID, R2_ACCESS_KEY, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, optional R2_ENDPOINT
//   SUPABASE_S3_ENDPOINT, SUPABASE_S3_ACCESS_KEY_ID, SUPABASE_S3_SECRET_ACCESS_KEY,
//   optional SUPABASE_S3_REGION (default us-east-1), optional SUPABASE_S3_BUCKET (default evidence)
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (flip and purge)

import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const MODES = ["inventory", "copy", "flip", "purge"];
const CONFIRM_TOKENS = {
  copy: "yes-copy-evidence-to-r2",
  flip: "yes-flip-evidence-rows",
  purge: "yes-purge-supabase-evidence",
};
const OUTPUT_DIR = "evidence-migration";
const FLIP_BATCH_SIZE = 200;
const PURGE_BATCH_SIZE = 100;
const DB_PAGE_SIZE = 1000;
// Keys travel in the query string of PostgREST filters. 200 long keys can exceed gateway URL
// limits, so a batch also closes early once its encoded keys reach this many characters.
const MAX_FILTER_CHARS = 6000;
const MAX_CONCURRENCY = 16;

class UsageError extends Error {}
class RestrictedError extends Error {}

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  const envRaw = readFileSync(envPath, "utf8");
  for (const line of envRaw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function parsePositiveInt(flag, raw, { allowZero = false } = {}) {
  if (!/^\d+$/.test(raw ?? "")) throw new UsageError(`${flag} must be a whole number.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || (!allowZero && value < 1)) throw new UsageError(`${flag} is out of range.`);
  return value;
}

function parseArgs(argv) {
  const options = {
    mode: "inventory",
    execute: false,
    prefix: "",
    limit: null,
    concurrency: 6,
    manifest: path.join(OUTPUT_DIR, "manifest.jsonl"),
    graceHours: 168,
  };
  let modeSeen = false;

  for (const arg of argv) {
    if (!arg.startsWith("--")) {
      if (modeSeen) throw new UsageError(`Unexpected argument: ${arg}`);
      if (!MODES.includes(arg)) throw new UsageError(`Unknown mode: ${arg}. Use one of: ${MODES.join(", ")}.`);
      options.mode = arg;
      modeSeen = true;
      continue;
    }
    if (arg === "--execute") {
      options.execute = true;
      continue;
    }
    const eq = arg.indexOf("=");
    const flag = eq === -1 ? arg : arg.slice(0, eq);
    const value = eq === -1 ? undefined : arg.slice(eq + 1);
    switch (flag) {
      case "--prefix":
        if (!value) throw new UsageError("--prefix needs a value.");
        options.prefix = value;
        break;
      case "--limit":
        options.limit = parsePositiveInt(flag, value);
        break;
      case "--concurrency":
        options.concurrency = parsePositiveInt(flag, value);
        if (options.concurrency > MAX_CONCURRENCY) {
          throw new UsageError(`--concurrency cannot exceed ${MAX_CONCURRENCY}.`);
        }
        break;
      case "--manifest":
        if (!value) throw new UsageError("--manifest needs a path.");
        options.manifest = value;
        break;
      case "--grace-hours":
        options.graceHours = parsePositiveInt(flag, value, { allowZero: true });
        break;
      default:
        throw new UsageError(`Unknown option: ${flag}`);
    }
  }
  return options;
}

function requireEnv(names) {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length > 0) throw new UsageError(`Missing environment variable(s): ${missing.join(", ")}.`);
}

function checkEnvForMode(mode) {
  const r2 = ["R2_ACCESS_KEY", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"];
  const s3 = ["SUPABASE_S3_ENDPOINT", "SUPABASE_S3_ACCESS_KEY_ID", "SUPABASE_S3_SECRET_ACCESS_KEY"];
  const db = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  const needed = mode === "flip" ? [...r2, ...db] : mode === "purge" ? [...r2, ...s3, ...db] : [...r2, ...s3];
  if (!process.env.R2_ENDPOINT) needed.unshift("R2_ACCOUNT_ID");
  requireEnv(needed);
}

function s3Client({ endpoint, region, accessKeyId, secretAccessKey }) {
  return new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

function r2Store() {
  return {
    label: "R2",
    bucket: process.env.R2_BUCKET_NAME,
    client: s3Client({
      endpoint: process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      region: "auto",
      accessKeyId: process.env.R2_ACCESS_KEY,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    }),
  };
}

function supabaseStore() {
  return {
    label: "Supabase",
    bucket: process.env.SUPABASE_S3_BUCKET || "evidence",
    client: s3Client({
      endpoint: process.env.SUPABASE_S3_ENDPOINT,
      region: process.env.SUPABASE_S3_REGION || "us-east-1",
      accessKeyId: process.env.SUPABASE_S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.SUPABASE_S3_SECRET_ACCESS_KEY,
    }),
  };
}

function dbClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function httpStatus(error) {
  return error?.$metadata?.httpStatusCode ?? error?.status ?? null;
}

function describeError(error) {
  const status = httpStatus(error);
  return `${error?.name ?? "Error"}${status ? ` (HTTP ${status})` : ""}`;
}

function restricted() {
  return new RestrictedError(
    "Supabase answered HTTP 402: the organisation is restricted. Stopping now; nothing further was attempted. " +
      "Resolve the restriction in the Supabase dashboard, then re-run this command. It resumes safely."
  );
}

async function send(store, command) {
  try {
    return await store.client.send(command);
  } catch (error) {
    if (store.label === "Supabase" && httpStatus(error) === 402) throw restricted();
    throw error;
  }
}

function assertDbOk(result, action) {
  if (result.status === 402) throw restricted();
  if (result.error) throw new Error(`Database ${action} failed (HTTP ${result.status ?? "unknown"}).`);
}

async function listAll(store, prefix) {
  const objects = new Map();
  let token;
  do {
    const page = await send(
      store,
      new ListObjectsV2Command({ Bucket: store.bucket, Prefix: prefix || undefined, ContinuationToken: token })
    );
    for (const item of page.Contents ?? []) {
      if (!item.Key || item.Key.endsWith("/") || item.Key.endsWith("/.emptyFolderPlaceholder")) continue;
      objects.set(item.Key, Number(item.Size ?? 0));
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return objects;
}

async function headSize(store, key) {
  try {
    const head = await send(store, new HeadObjectCommand({ Bucket: store.bucket, Key: key }));
    return Number(head.ContentLength ?? 0);
  } catch (error) {
    if (error instanceof RestrictedError) throw error;
    if (httpStatus(error) === 404 || error?.name === "NotFound") return null;
    throw error;
  }
}

function loadManifest(file) {
  const entries = new Map();
  if (!existsSync(file)) return entries;
  const raw = readFileSync(file, "utf8");
  let invalid = 0;
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (typeof entry.key === "string" && Number.isFinite(entry.size)) entries.set(entry.key, entry);
      else invalid += 1;
    } catch {
      invalid += 1;
    }
  }
  if (invalid > 0) console.warn(`Warning: ignored ${invalid} unreadable manifest line(s).`);
  // An interrupted run can leave a partial last line. Terminate it so the next append is intact.
  if (raw.length > 0 && !raw.endsWith("\n")) appendFileSync(file, "\n");
  return entries;
}

function appendManifest(file, entry) {
  mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  appendFileSync(file, `${JSON.stringify(entry)}\n`);
}

function chunkForFilter(keys, maxItems) {
  const batches = [];
  let current = [];
  let chars = 0;
  for (const key of keys) {
    const encoded = encodeURIComponent(key).length + 8;
    if (current.length > 0 && (current.length >= maxItems || chars + encoded > MAX_FILTER_CHARS)) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(key);
    chars += encoded;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

async function runPool(items, concurrency, worker) {
  let next = 0;
  let fatal = null;
  async function lane() {
    while (!fatal && next < items.length) {
      const item = items[next];
      next += 1;
      try {
        await worker(item);
      } catch (error) {
        if (error instanceof RestrictedError) fatal = error;
        else throw error;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, lane));
  if (fatal) throw fatal;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = -1;
  do {
    value /= 1024;
    unit += 1;
  } while (value >= 1024 && unit < units.length - 1);
  return `${value.toFixed(2)} ${units[unit]}`;
}

function sumSizes(rows) {
  return rows.reduce((total, row) => total + row.size, 0);
}

function classify(source, dest) {
  const present = [];
  const missing = [];
  const mismatched = [];
  for (const key of [...source.keys()].sort()) {
    const size = source.get(key);
    const destSize = dest.get(key);
    if (destSize === undefined) missing.push({ key, size });
    else if (destSize === size) present.push({ key, size });
    else mismatched.push({ key, size, r2Size: destSize });
  }
  return { present, missing, mismatched };
}

function requireConfirmation(options) {
  if (!options.execute) return false;
  if (process.env.CONFIRM !== CONFIRM_TOKENS[options.mode]) {
    throw new UsageError(
      `Refusing to run: --execute also requires CONFIRM=${CONFIRM_TOKENS[options.mode]} in the environment.`
    );
  }
  return true;
}

async function runInventory(options) {
  const source = await listAll(supabaseStore(), options.prefix);
  const dest = await listAll(r2Store(), options.prefix);
  const { present, missing, mismatched } = classify(source, dest);

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const toJsonl = (rows) => rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : "");
  writeFileSync(path.join(OUTPUT_DIR, "missing.jsonl"), toJsonl(missing));
  writeFileSync(path.join(OUTPUT_DIR, "size-mismatch.jsonl"), toJsonl(mismatched));

  const prefixes = new Map();
  for (const [key, size] of source) {
    const top = key.includes("/") ? key.slice(0, key.indexOf("/") + 1) : "(root)";
    const row = prefixes.get(top) ?? { count: 0, size: 0 };
    row.count += 1;
    row.size += size;
    prefixes.set(top, row);
  }

  const onlyInR2 = [...dest.keys()].filter((key) => !source.has(key)).length;
  const sourceBytes = [...source.values()].reduce((total, size) => total + size, 0);
  console.log("=== Inventory (read-only) ===");
  console.log(`Supabase objects:        ${source.size} (${formatBytes(sourceBytes)})`);
  console.log(`R2 objects:              ${dest.size}`);
  console.log(`Already in R2:           ${present.length} (${formatBytes(sumSizes(present))})`);
  console.log(`Missing from R2:         ${missing.length} (${formatBytes(sumSizes(missing))})`);
  console.log(`Size mismatches:         ${mismatched.length} (${formatBytes(sumSizes(mismatched))})`);
  console.log(`Only in R2 (untouched):  ${onlyInR2}`);
  console.log("Largest top-level prefixes:");
  for (const [name, row] of [...prefixes.entries()].sort((a, b) => b[1].size - a[1].size).slice(0, 10)) {
    console.log(`  ${name}  ${row.count} objects, ${formatBytes(row.size)}`);
  }
  console.log(`Reports written to ${OUTPUT_DIR}/`);
  return 0;
}

async function copyObject(sourceStore, destStore, item, options, stats) {
  const object = await send(sourceStore, new GetObjectCommand({ Bucket: sourceStore.bucket, Key: item.key }));
  const body = Buffer.from(await object.Body.transformToByteArray());
  if (body.length !== item.size) {
    stats.failed += 1;
    console.error(`Failed: ${item.key}: source size changed since listing.`);
    return;
  }

  const md5 = createHash("md5").update(body).digest("hex");
  let put;
  try {
    put = await send(
      destStore,
      new PutObjectCommand({
        Bucket: destStore.bucket,
        Key: item.key,
        Body: body,
        ContentLength: body.length,
        ContentType: object.ContentType || "application/octet-stream",
        // Never overwrite an object that appeared in R2 after the listing was taken.
        IfNoneMatch: "*",
      })
    );
  } catch (error) {
    if (httpStatus(error) === 412) {
      stats.conflicts += 1;
      console.warn(`Skipped: ${item.key}: appeared in R2 during this run. Re-run to re-check it.`);
      return;
    }
    throw error;
  }

  const etag = (put.ETag ?? "").replaceAll("\"", "").toLowerCase();
  if (etag !== md5) {
    stats.failed += 1;
    console.error(`Failed: ${item.key}: checksum mismatch after upload. Removing the R2 copy.`);
    try {
      await send(destStore, new DeleteObjectCommand({ Bucket: destStore.bucket, Key: item.key }));
    } catch (error) {
      console.error(`Could not remove the bad R2 copy of ${item.key}: ${describeError(error)}`);
    }
    return;
  }

  appendManifest(options.manifest, { key: item.key, size: item.size, md5, copiedAt: new Date().toISOString() });
  stats.copied += 1;
  stats.bytes += item.size;
}

async function runCopy(options) {
  const live = requireConfirmation(options);
  const sourceStore = supabaseStore();
  const destStore = r2Store();
  const source = await listAll(sourceStore, options.prefix);
  const dest = await listAll(destStore, options.prefix);
  const { present, missing, mismatched } = classify(source, dest);
  const manifest = loadManifest(options.manifest);

  // --limit covers both kinds of work, so a 50-file pilot manifest holds exactly 50 new entries
  // and the following flip cannot reach beyond the pilot.
  let work = [
    ...present.filter((row) => !manifest.has(row.key)).map((row) => ({ ...row, action: "register" })),
    ...missing.map((row) => ({ ...row, action: "copy" })),
  ].sort((a, b) => (a.key < b.key ? -1 : 1));
  if (options.limit !== null) work = work.slice(0, options.limit);
  const toCopy = work.filter((row) => row.action === "copy");
  const toRegister = work.filter((row) => row.action === "register");

  if (!live) {
    console.log("=== Copy (dry run: nothing was changed) ===");
    console.log(`Would copy:                     ${toCopy.length} (${formatBytes(sumSizes(toCopy))})`);
    console.log(`Would record as already in R2:  ${toRegister.length}`);
    console.log(`Size mismatches left alone:     ${mismatched.length}`);
    console.log("Add --execute and the CONFIRM token to run.");
    return 0;
  }

  const now = new Date().toISOString();
  for (const row of toRegister) {
    appendManifest(options.manifest, { key: row.key, size: row.size, md5: null, copiedAt: now, alreadyPresent: true });
  }

  const stats = { copied: 0, bytes: 0, failed: 0, conflicts: 0 };
  await runPool(toCopy, options.concurrency, async (item) => {
    try {
      await copyObject(sourceStore, destStore, item, options, stats);
    } catch (error) {
      if (error instanceof RestrictedError) throw error;
      stats.failed += 1;
      console.error(`Failed: ${item.key}: ${describeError(error)}`);
    }
    const done = stats.copied + stats.failed + stats.conflicts;
    if (done % 100 === 0) console.log(`  ...${done}/${toCopy.length}`);
  });

  console.log("=== Copy complete ===");
  console.log(`Copied and verified:         ${stats.copied} (${formatBytes(stats.bytes)})`);
  console.log(`Recorded as already in R2:   ${toRegister.length}`);
  console.log(`Failed:                      ${stats.failed}`);
  console.log(`Appeared during run:         ${stats.conflicts}`);
  console.log(`Size mismatches left alone:  ${mismatched.length}`);
  return stats.failed > 0 ? 1 : 0;
}

function selectManifest(manifest, options) {
  let entries = [...manifest.values()]
    .filter((entry) => entry.key.startsWith(options.prefix))
    .sort((a, b) => (a.key < b.key ? -1 : 1));
  if (options.limit !== null) entries = entries.slice(0, options.limit);
  return entries;
}

async function runFlip(options) {
  const live = requireConfirmation(options);
  const manifest = loadManifest(options.manifest);
  const entries = selectManifest(manifest, options);
  if (entries.length === 0) {
    console.log("No manifest entries to flip.");
    return 0;
  }

  // A row must never be pointed at an object that is not actually in R2.
  const dest = await listAll(r2Store(), options.prefix);
  const verified = entries.filter((entry) => dest.get(entry.key) === entry.size);
  const skipped = entries.length - verified.length;
  const db = dbClient();
  const bucket = process.env.R2_BUCKET_NAME;
  let rows = 0;

  for (const batch of chunkForFilter(verified.map((entry) => entry.key), FLIP_BATCH_SIZE)) {
    if (live) {
      const result = await db
        .from("visit_evidence")
        .update({ storage_provider: "r2", bucket }, { count: "exact" })
        .in("file_url", batch)
        .eq("storage_provider", "supabase");
      assertDbOk(result, "update");
      rows += result.count ?? 0;
    } else {
      const result = await db
        .from("visit_evidence")
        .select("id", { count: "exact", head: true })
        .in("file_url", batch)
        .eq("storage_provider", "supabase");
      assertDbOk(result, "count");
      rows += result.count ?? 0;
    }
  }

  console.log(live ? "=== Flip complete ===" : "=== Flip (dry run: nothing was changed) ===");
  console.log(`Manifest keys considered:       ${entries.length}`);
  console.log(`Skipped (not verified in R2):   ${skipped}`);
  console.log(`${live ? "Rows flipped to R2:" : "Rows that would flip:"}           ${rows}`);
  if (!live) console.log("Add --execute and the CONFIRM token to run.");
  return skipped > 0 ? 1 : 0;
}

async function keysStillOnSupabase(db, keys) {
  const blocked = new Set();
  for (const batch of chunkForFilter(keys, PURGE_BATCH_SIZE)) {
    for (let from = 0; ; from += DB_PAGE_SIZE) {
      const result = await db
        .from("visit_evidence")
        .select("id, file_url")
        .in("file_url", batch)
        .eq("storage_provider", "supabase")
        .order("id", { ascending: true })
        .range(from, from + DB_PAGE_SIZE - 1);
      assertDbOk(result, "safety check");
      for (const row of result.data ?? []) blocked.add(row.file_url);
      if ((result.data ?? []).length < DB_PAGE_SIZE) break;
    }
  }
  return blocked;
}

async function runPurge(options) {
  const live = requireConfirmation(options);
  const sourceStore = supabaseStore();
  const destStore = r2Store();
  const db = dbClient();
  const manifest = loadManifest(options.manifest);
  const cutoff = Date.now() - options.graceHours * 60 * 60 * 1000;
  const all = selectManifest(manifest, { ...options, limit: null });
  let aged = all.filter((entry) => {
    const copiedAt = Date.parse(entry.copiedAt);
    return Number.isFinite(copiedAt) && copiedAt <= cutoff;
  });
  const insideGrace = all.length - aged.length;
  if (options.limit !== null) aged = aged.slice(0, options.limit);

  const stats = {
    deletable: 0,
    deleted: 0,
    bytes: 0,
    alreadyGone: 0,
    r2Missing: 0,
    r2SizeMismatch: 0,
    sourceChanged: 0,
    stillOnSupabase: 0,
    failed: 0,
  };

  for (let i = 0; i < aged.length; i += PURGE_BATCH_SIZE) {
    const batch = aged.slice(i, i + PURGE_BATCH_SIZE);
    const passed = [];

    await runPool(batch, options.concurrency, async (entry) => {
      try {
        const r2Size = await headSize(destStore, entry.key);
        if (r2Size === null) {
          stats.r2Missing += 1;
          return;
        }
        if (r2Size !== entry.size) {
          stats.r2SizeMismatch += 1;
          return;
        }
        const sourceSize = await headSize(sourceStore, entry.key);
        if (sourceSize === null) {
          stats.alreadyGone += 1;
          return;
        }
        if (sourceSize !== entry.size) {
          stats.sourceChanged += 1;
          return;
        }
        passed.push(entry);
      } catch (error) {
        if (error instanceof RestrictedError) throw error;
        stats.failed += 1;
        console.error(`Check failed, keeping ${entry.key}: ${describeError(error)}`);
      }
    });
    if (passed.length === 0) continue;

    // Checked last, immediately before the delete, so the window for a row to change is small.
    const blocked = await keysStillOnSupabase(db, passed.map((entry) => entry.key));
    stats.stillOnSupabase += blocked.size;
    const deletable = passed.filter((entry) => !blocked.has(entry.key));
    stats.deletable += deletable.length;
    if (!live || deletable.length === 0) continue;

    try {
      const result = await send(
        sourceStore,
        new DeleteObjectsCommand({
          Bucket: sourceStore.bucket,
          Delete: { Objects: deletable.map((entry) => ({ Key: entry.key })), Quiet: true },
        })
      );
      const errored = new Set((result.Errors ?? []).map((item) => item.Key));
      stats.failed += errored.size;
      for (const entry of deletable) {
        if (errored.has(entry.key)) continue;
        stats.deleted += 1;
        stats.bytes += entry.size;
      }
    } catch (error) {
      if (error instanceof RestrictedError) throw error;
      stats.failed += deletable.length;
      console.error(`Delete batch failed: ${describeError(error)}`);
    }
  }

  console.log(live ? "=== Purge complete ===" : "=== Purge (dry run: nothing was deleted) ===");
  console.log(`Inside ${options.graceHours}h grace period (kept):  ${insideGrace}`);
  console.log(`Checked:                         ${aged.length}`);
  if (live) console.log(`Deleted from Supabase:           ${stats.deleted} (${formatBytes(stats.bytes)})`);
  else console.log(`Would delete from Supabase:      ${stats.deletable}`);
  console.log(`Already gone from Supabase:      ${stats.alreadyGone}`);
  console.log(`Kept: row still on Supabase:     ${stats.stillOnSupabase}`);
  console.log(`Kept: missing from R2:           ${stats.r2Missing}`);
  console.log(`Kept: R2 size mismatch:          ${stats.r2SizeMismatch}`);
  console.log(`Kept: source changed since copy: ${stats.sourceChanged}`);
  console.log(`Failed:                          ${stats.failed}`);
  if (!live) console.log("Add --execute and the CONFIRM token to run.");
  return stats.failed > 0 ? 1 : 0;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  loadEnvLocal();
  // Refuse before any network call or environment check can be mistaken for progress.
  if (options.mode !== "inventory") requireConfirmation(options);
  checkEnvForMode(options.mode);
  const handlers = { inventory: runInventory, copy: runCopy, flip: runFlip, purge: runPurge };
  return handlers[options.mode](options);
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    if (error instanceof UsageError || error instanceof RestrictedError) {
      console.error(error.message);
      process.exitCode = error instanceof RestrictedError ? 2 : 1;
      return;
    }
    console.error(`Stopped: ${error instanceof Error && error.message.startsWith("Database ") ? error.message : describeError(error)}`);
    process.exitCode = 1;
  });
