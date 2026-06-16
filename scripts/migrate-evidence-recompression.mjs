// 2026-06 evidence photo recompression migration.
//
// See docs/migrations/2026-06-evidence-recompression-migration.md for the
// full design, rollback, and verification plan.
//
// !!! DO NOT RUN WITHOUT EXPLICIT APPROVAL !!!
//
// This script WRITES:
//   - new compressed objects under {org}/{visit}/recompressed-{id}.webp
//   - visit_evidence.file_url / file_size / original_file_size /
//     compressed_file_size / mime_type / original_file_name
//   - moves original objects to archive/evidence-migration-2026-06/**
//     (rename, never deletes)
//   - public.evidence_recompression_migrations tracking rows
//
// It is idempotent and resumable: re-running skips rows already marked
// 'completed' in evidence_recompression_migrations for batch_id='2026-06',
// and retries 'failed'/'pending' rows up to MAX_ATTEMPTS.

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
const MAX_WIDTH = 1280;
const QUALITY = 70;
const OVERSIZED_THRESHOLD = 400 * 1024;
const CONCURRENCY = 5;
const DOWNLOAD_TIMEOUT_MS = 60000;
const DOWNLOAD_RETRIES = 2;
const SIGNED_URL_TTL_SECONDS = 120;
const BATCH_ID = "2026-06";
const MAX_ATTEMPTS = 3;
const MOVE_RETRIES = 3;

// Required to confirm intent. Run as: CONFIRM=yes-migrate-evidence node scripts/migrate-evidence-recompression.mjs
const CONFIRM_TOKEN = "yes-migrate-evidence";

async function fetchPageWithRetry(from, to, maxRetries = 5) {
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    const { data, error } = await supabase
      .from("visit_evidence")
      .select("id, file_url, file_name, file_size, original_file_size, compressed_file_size, mime_type, created_at, organization_id, visit_id")
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .range(from, to);

    if (!error) return data;

    if (attempt === maxRetries) {
      console.error("Query failed after retries:", error.message);
      process.exit(1);
    }

    const delayMs = attempt * 1000;
    console.log(`  Query error (attempt ${attempt}/${maxRetries}): ${error.message}. Retrying in ${delayMs}ms...`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return null;
}

async function fetchEligibleRows() {
  const rows = [];
  let from = 0;

  for (;;) {
    const data = await fetchPageWithRetry(from, from + PAGE_SIZE - 1);
    if (!data || data.length === 0) break;

    for (const row of data) {
      const fileSize = row.file_size ?? 0;
      const missingMetadata = row.original_file_size == null || row.compressed_file_size == null;
      const oversized = fileSize > OVERSIZED_THRESHOLD;
      if (missingMetadata || oversized) {
        rows.push(row);
      }
    }

    from += PAGE_SIZE;
    if (data.length < PAGE_SIZE) break;
  }

  return rows;
}

async function fetchTrackingRows() {
  const map = new Map();
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

    for (const row of data) map.set(row.visit_evidence_id, row);

    from += PAGE_SIZE;
    if (data.length < PAGE_SIZE) break;
  }

  return map;
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
  let lastError = null;
  for (let attempt = 1; attempt <= DOWNLOAD_RETRIES; attempt += 1) {
    try {
      const { data: signed, error: signedError } = await supabase.storage
        .from("evidence")
        .createSignedUrl(filePath, SIGNED_URL_TTL_SECONDS);

      if (signedError || !signed?.signedUrl) {
        lastError = signedError ?? new Error("failed to create signed URL");
        continue;
      }

      return await downloadViaHttps(signed.signedUrl, DOWNLOAD_TIMEOUT_MS);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastError;
}

function originalPathDir(filePath) {
  const idx = filePath.lastIndexOf("/");
  return idx === -1 ? "" : filePath.slice(0, idx);
}

function compressedPathFor(row) {
  const dir = originalPathDir(row.file_url);
  return `${dir}/recompressed-${row.id}.webp`;
}

function archivePathFor(originalPath) {
  return `archive/evidence-migration-${BATCH_ID}/${originalPath}`;
}

async function upsertTrackingRow(row, fields) {
  const existing = await supabase
    .from("evidence_recompression_migrations")
    .select("id")
    .eq("visit_evidence_id", row.id)
    .eq("batch_id", BATCH_ID)
    .maybeSingle();

  if (existing.error) throw existing.error;

  if (existing.data) {
    const { error } = await supabase
      .from("evidence_recompression_migrations")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", existing.data.id);
    if (error) throw error;
    return existing.data.id;
  }

  const { data, error } = await supabase
    .from("evidence_recompression_migrations")
    .insert({
      visit_evidence_id: row.id,
      organization_id: row.organization_id,
      batch_id: BATCH_ID,
      original_path: row.file_url,
      original_file_url: row.file_url,
      original_mime_type: row.mime_type,
      original_size: row.file_size,
      status: "pending",
      ...fields,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

async function markFailed(row, errorMessage, attemptCount) {
  await upsertTrackingRow(row, {
    status: "failed",
    error_message: errorMessage,
    attempt_count: attemptCount,
    processed_at: new Date().toISOString(),
  });
}

async function processRow(row, attemptCount) {
  // Step 2: download original
  let originalBuffer;
  try {
    originalBuffer = await downloadObject(row.file_url);
  } catch (err) {
    await markFailed(row, `download failed: ${err instanceof Error ? err.message : String(err)}`, attemptCount);
    return { status: "failed", id: row.id };
  }

  // Step 3: compress
  let compressedBuffer;
  let compressedMeta;
  try {
    const metadata = await sharp(originalBuffer).metadata();
    if (!metadata.width || !metadata.height) {
      await markFailed(row, "source image has no width/height metadata (unsupported format)", attemptCount);
      return { status: "failed", id: row.id };
    }
    const targetWidth = Math.min(metadata.width, MAX_WIDTH);
    const resized = targetWidth < metadata.width ? sharp(originalBuffer).resize({ width: targetWidth }) : sharp(originalBuffer);
    compressedBuffer = await resized.webp({ quality: QUALITY }).toBuffer();
    compressedMeta = await sharp(compressedBuffer).metadata();
  } catch (err) {
    await markFailed(row, `compression failed: ${err instanceof Error ? err.message : String(err)}`, attemptCount);
    return { status: "failed", id: row.id };
  }

  // Step 4: verify in-memory
  if (!compressedMeta.width || !compressedMeta.height) {
    await markFailed(row, "compressed image has no width/height metadata", attemptCount);
    return { status: "failed", id: row.id };
  }
  if (compressedBuffer.length >= originalBuffer.length) {
    await markFailed(row, `compressed size (${compressedBuffer.length}) is not smaller than original (${originalBuffer.length})`, attemptCount);
    return { status: "failed", id: row.id };
  }

  const compressedPath = compressedPathFor(row);
  const archivePath = archivePathFor(row.file_url);

  // Step 5: upload compressed object (upsert=true so a half-finished
  // prior attempt is safely overwritten without affecting visit_evidence
  // or the original object, which haven't been touched yet)
  const { error: uploadError } = await supabase.storage
    .from("evidence")
    .upload(compressedPath, compressedBuffer, { contentType: "image/webp", upsert: true });

  if (uploadError) {
    await markFailed(row, `upload to ${compressedPath} failed: ${uploadError.message}`, attemptCount);
    return { status: "failed", id: row.id };
  }

  // Step 6: re-download and verify the uploaded object
  try {
    const verifyBuffer = await downloadObject(compressedPath);
    if (verifyBuffer.length !== compressedBuffer.length) {
      await markFailed(row, `uploaded object size mismatch: expected ${compressedBuffer.length}, got ${verifyBuffer.length}`, attemptCount);
      return { status: "failed", id: row.id };
    }
    const verifyMeta = await sharp(verifyBuffer).metadata();
    if (verifyMeta.width !== compressedMeta.width || verifyMeta.height !== compressedMeta.height) {
      await markFailed(row, "uploaded object dimensions mismatch after re-download", attemptCount);
      return { status: "failed", id: row.id };
    }
  } catch (err) {
    await markFailed(row, `post-upload verification failed: ${err instanceof Error ? err.message : String(err)}`, attemptCount);
    return { status: "failed", id: row.id };
  }

  // Step 7: update visit_evidence to point at the compressed object
  const { error: updateError } = await supabase
    .from("visit_evidence")
    .update({
      file_url: compressedPath,
      file_size: compressedBuffer.length,
      original_file_size: row.original_file_size ?? row.file_size,
      compressed_file_size: compressedBuffer.length,
      mime_type: "image/webp",
      original_file_name: row.original_file_name ?? row.file_name,
    })
    .eq("id", row.id);

  if (updateError) {
    await markFailed(row, `visit_evidence update failed: ${updateError.message}`, attemptCount);
    return { status: "failed", id: row.id };
  }

  // Step 8: move original into the archive (rename, never deletes)
  let moveError = null;
  for (let attempt = 1; attempt <= MOVE_RETRIES; attempt += 1) {
    const { error } = await supabase.storage.from("evidence").move(row.file_url, archivePath);
    if (!error) {
      moveError = null;
      break;
    }
    moveError = error;
    await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
  }

  if (moveError) {
    // visit_evidence already points at the valid compressed object, so
    // the app is unaffected, but the original was not archived. Surface
    // this loudly for manual follow-up (retry the move only).
    await upsertTrackingRow(row, {
      status: "failed",
      error_message: `visit_evidence updated successfully but archive move failed: ${moveError.message}. Original still at ${row.file_url}; manual move to ${archivePath} required.`,
      compressed_path: compressedPath,
      original_size: originalBuffer.length,
      compressed_size: compressedBuffer.length,
      reduction_percent: Number((((originalBuffer.length - compressedBuffer.length) / originalBuffer.length) * 100).toFixed(2)),
      attempt_count: attemptCount,
      processed_at: new Date().toISOString(),
    });
    return { status: "failed", id: row.id };
  }

  // Step 9: mark complete
  await upsertTrackingRow(row, {
    status: "completed",
    archive_path: archivePath,
    compressed_path: compressedPath,
    original_size: originalBuffer.length,
    compressed_size: compressedBuffer.length,
    reduction_percent: Number((((originalBuffer.length - compressedBuffer.length) / originalBuffer.length) * 100).toFixed(2)),
    attempt_count: attemptCount,
    error_message: null,
    processed_at: new Date().toISOString(),
  });

  return {
    status: "completed",
    id: row.id,
    old_size: originalBuffer.length,
    new_size: compressedBuffer.length,
  };
}

async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runLane() {
    for (;;) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) return;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  const runners = Array.from({ length: Math.min(limit, items.length) }, () => runLane());
  await Promise.all(runners);
  return results;
}

async function main() {
  if (process.env.CONFIRM !== CONFIRM_TOKEN) {
    console.error(`Refusing to run without confirmation.`);
    console.error(`This script writes to Supabase Storage and the visit_evidence table.`);
    console.error(`Re-run as: CONFIRM=${CONFIRM_TOKEN} node scripts/migrate-evidence-recompression.mjs`);
    process.exit(1);
  }

  console.log("Fetching eligible rows...");
  const rows = await fetchEligibleRows();
  console.log(`Found ${rows.length} eligible rows.`);

  console.log("Fetching existing tracking rows for batch " + BATCH_ID + "...");
  const tracking = await fetchTrackingRows();

  const toProcess = [];
  let skippedCompleted = 0;
  let skippedMaxAttempts = 0;

  for (const row of rows) {
    const existing = tracking.get(row.id);
    if (existing?.status === "completed") {
      skippedCompleted += 1;
      continue;
    }
    if (existing?.status === "failed" && (existing.attempt_count ?? 0) >= MAX_ATTEMPTS) {
      skippedMaxAttempts += 1;
      continue;
    }
    toProcess.push({ row, attemptCount: (existing?.attempt_count ?? 0) + 1 });
  }

  console.log(`  Already completed (skipped): ${skippedCompleted}`);
  console.log(`  Max attempts exceeded (skipped, needs manual review): ${skippedMaxAttempts}`);
  console.log(`  To process this run: ${toProcess.length}`);
  console.log(`Processing with concurrency=${CONCURRENCY}...\n`);

  let processed = 0;
  const results = await runWithConcurrency(toProcess, CONCURRENCY, async ({ row, attemptCount }) => {
    const result = await processRow(row, attemptCount);
    processed += 1;
    if (processed % 10 === 0 || processed === toProcess.length) {
      console.log(`  ...processed ${processed}/${toProcess.length}`);
    }
    return result;
  });

  const completed = results.filter((r) => r.status === "completed");
  const failed = results.filter((r) => r.status === "failed");

  let totalOld = 0;
  let totalNew = 0;
  for (const r of completed) {
    totalOld += r.old_size;
    totalNew += r.new_size;
  }

  console.log("\n=== Migration Run Summary ===");
  console.log(`Processed this run: ${results.length}`);
  console.log(`  Completed: ${completed.length}`);
  console.log(`  Failed: ${failed.length}`);
  console.log(`Skipped (already completed): ${skippedCompleted}`);
  console.log(`Skipped (max attempts exceeded): ${skippedMaxAttempts}`);
  if (completed.length > 0) {
    console.log(`\nThis run's storage impact:`);
    console.log(`  Old size: ${(totalOld / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`  New size: ${(totalNew / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`  Saved: ${((totalOld - totalNew) / (1024 * 1024)).toFixed(2)} MB`);
  }
  if (failed.length > 0) {
    console.log(`\n${failed.length} row(s) failed this run. Re-run the script to retry (up to ${MAX_ATTEMPTS} attempts each), or inspect evidence_recompression_migrations for error_message.`);
  }
  console.log(`\nRun scripts/verify-evidence-recompression.mjs for full verification.`);
}

main();
