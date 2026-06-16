// Verification for the 2026-06 evidence recompression migration.
//
// READ-ONLY. Makes no writes to Storage or the database. Safe to run at
// any time, including repeatedly, before/during/after the migration.
//
// Checks (per docs/migrations/2026-06-evidence-recompression-migration.md):
//   1. Count of tracking rows by status.
//   2. For each 'completed' row: visit_evidence.file_url == compressed_path,
//      and compressed_path exists in storage.
//   3. For each 'completed' row: archive_path exists in storage
//      (proves the original was not deleted, only moved).
//   4. Integrity sample: re-download a sample of compressed objects and
//      confirm they're valid, readable WebP images.
//   5. Total storage saved across completed rows vs. dry-run estimate.
//   6. Summary report, including any 'failed' rows with error_message.

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import https from "node:https";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";

const envPath = path.resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
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
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

const PAGE_SIZE = 1000;
const BATCH_ID = "2026-06";
const INTEGRITY_SAMPLE_SIZE = 20;
const DOWNLOAD_TIMEOUT_MS = 60000;
const SIGNED_URL_TTL_SECONDS = 120;
const DRY_RUN_ESTIMATED_SAVINGS_MB = 2812.76;

function dirAndFile(filePath) {
  const idx = filePath.lastIndexOf("/");
  if (idx === -1) return { dir: "", file: filePath };
  return { dir: filePath.slice(0, idx), file: filePath.slice(idx + 1) };
}

async function objectExists(filePath) {
  const { dir, file } = dirAndFile(filePath);
  const { data, error } = await supabase.storage.from("evidence").list(dir, { limit: 1000, search: file });
  if (error) return { exists: false, error: error.message };
  const found = (data ?? []).find((entry) => entry.name === file);
  return { exists: Boolean(found), size: found?.metadata?.size };
}

function downloadViaHttps(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`request timed out after ${timeoutMs}ms`));
    });
  });
}

async function downloadObject(filePath) {
  const { data: signed, error: signedError } = await supabase.storage
    .from("evidence")
    .createSignedUrl(filePath, SIGNED_URL_TTL_SECONDS);

  if (signedError || !signed?.signedUrl) {
    throw signedError ?? new Error("failed to create signed URL");
  }

  return downloadViaHttps(signed.signedUrl, DOWNLOAD_TIMEOUT_MS);
}

async function fetchAllTrackingRows() {
  const rows = [];
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("evidence_recompression_migrations")
      .select("*")
      .eq("batch_id", BATCH_ID)
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error("Failed to fetch tracking rows:", error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;

    rows.push(...data);
    from += PAGE_SIZE;
    if (data.length < PAGE_SIZE) break;
  }

  return rows;
}

async function fetchVisitEvidenceById(ids) {
  const map = new Map();
  const CHUNK = 200;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("visit_evidence")
      .select("id, file_url, file_size, mime_type")
      .in("id", chunk);
    if (error) {
      console.error("Failed to fetch visit_evidence rows:", error.message);
      process.exit(1);
    }
    for (const row of data) map.set(row.id, row);
  }
  return map;
}

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function main() {
  console.log(`Fetching tracking rows for batch ${BATCH_ID}...`);
  const tracking = await fetchAllTrackingRows();

  const byStatus = new Map();
  for (const row of tracking) {
    byStatus.set(row.status, (byStatus.get(row.status) ?? 0) + 1);
  }

  console.log("\n=== 1. Tracking Row Counts ===");
  console.log(`Total tracking rows: ${tracking.length}`);
  for (const [status, count] of byStatus.entries()) {
    console.log(`  ${status}: ${count}`);
  }

  const completed = tracking.filter((r) => r.status === "completed");
  const failed = tracking.filter((r) => r.status === "failed");

  console.log(`\n=== 2. DB -> Storage Pointer Check (${completed.length} completed rows) ===`);
  const visitEvidenceMap = await fetchVisitEvidenceById(completed.map((r) => r.visit_evidence_id));

  let pointerMismatches = 0;
  let compressedMissing = 0;
  let checked = 0;
  for (const row of completed) {
    checked += 1;
    const ve = visitEvidenceMap.get(row.visit_evidence_id);
    if (!ve) {
      pointerMismatches += 1;
      console.log(`  [MISMATCH] visit_evidence ${row.visit_evidence_id} not found`);
      continue;
    }
    if (ve.file_url !== row.compressed_path) {
      pointerMismatches += 1;
      console.log(`  [MISMATCH] visit_evidence ${row.visit_evidence_id}: file_url=${ve.file_url} != compressed_path=${row.compressed_path}`);
      continue;
    }
    const exists = await objectExists(row.compressed_path);
    if (!exists.exists) {
      compressedMissing += 1;
      console.log(`  [MISSING] compressed object not found: ${row.compressed_path}`);
    }
    if (checked % 100 === 0) console.log(`  ...checked ${checked}/${completed.length}`);
  }
  console.log(`Pointer mismatches: ${pointerMismatches}`);
  console.log(`Compressed objects missing: ${compressedMissing}`);

  console.log(`\n=== 3. Archive Existence Check (${completed.length} completed rows) ===`);
  let archiveMissing = 0;
  checked = 0;
  for (const row of completed) {
    checked += 1;
    if (!row.archive_path) {
      archiveMissing += 1;
      console.log(`  [MISSING] no archive_path recorded for ${row.visit_evidence_id}`);
      continue;
    }
    const exists = await objectExists(row.archive_path);
    if (!exists.exists) {
      archiveMissing += 1;
      console.log(`  [MISSING] archive object not found: ${row.archive_path}`);
    }
    if (checked % 100 === 0) console.log(`  ...checked ${checked}/${completed.length}`);
  }
  console.log(`Archive objects missing: ${archiveMissing}`);

  console.log(`\n=== 4. Integrity Sample (up to ${INTEGRITY_SAMPLE_SIZE} compressed objects) ===`);
  const sample = shuffle(completed).slice(0, INTEGRITY_SAMPLE_SIZE);
  let integrityFailures = 0;
  for (const row of sample) {
    try {
      const buffer = await downloadObject(row.compressed_path);
      const meta = await sharp(buffer).metadata();
      if (!meta.width || !meta.height || meta.format !== "webp") {
        integrityFailures += 1;
        console.log(`  [BAD] ${row.compressed_path}: format=${meta.format}, width=${meta.width}, height=${meta.height}`);
      } else {
        console.log(`  [OK] ${row.compressed_path}: ${meta.width}x${meta.height} webp, ${(buffer.length / 1024).toFixed(1)}KB`);
      }
    } catch (err) {
      integrityFailures += 1;
      console.log(`  [ERROR] ${row.compressed_path}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log(`Integrity failures: ${integrityFailures}/${sample.length}`);

  console.log("\n=== 5. Storage Savings ===");
  let totalOld = 0;
  let totalNew = 0;
  for (const row of completed) {
    totalOld += row.original_size ?? 0;
    totalNew += row.compressed_size ?? 0;
  }
  const savedMb = (totalOld - totalNew) / (1024 * 1024);
  console.log(`Old total size (completed rows): ${(totalOld / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`New total size (completed rows): ${(totalNew / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`Saved: ${savedMb.toFixed(2)} MB`);
  console.log(`Dry-run estimate was: ${DRY_RUN_ESTIMATED_SAVINGS_MB} MB`);
  console.log(`Difference: ${(savedMb - DRY_RUN_ESTIMATED_SAVINGS_MB).toFixed(2)} MB`);

  console.log("\n=== 6. Failed Rows ===");
  if (failed.length === 0) {
    console.log("None.");
  } else {
    for (const row of failed) {
      console.log(`  ${row.visit_evidence_id} | attempts=${row.attempt_count} | ${row.error_message}`);
    }
  }

  console.log("\n=== Summary ===");
  console.log(`Total: ${tracking.length} | Completed: ${completed.length} | Failed: ${failed.length} | Pending: ${(byStatus.get("pending") ?? 0)}`);
  const allOk = pointerMismatches === 0 && compressedMissing === 0 && archiveMissing === 0 && integrityFailures === 0;
  console.log(allOk ? "All checks passed." : "Some checks FAILED — see details above.");
}

main();
