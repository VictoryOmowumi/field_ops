# Evidence Photo Recompression Migration — 2026-06

Batch ID: `2026-06`
Scope: 1,242 `visit_evidence` rows identified by `scripts/dry-run-evidence-recompression.mjs`
(missing `original_file_size`/`compressed_file_size` OR `file_size > 400KB`).

Dry-run results (`scripts/dry-run-results.log`):
- 1,242 / 1,242 rows recompress successfully (0 failures, 0 unsupported formats)
- Old total size: 3,022.16 MB → New estimated size: 209.40 MB
- Estimated savings: 2,812.76 MB (93.1%)

---

## 1. Design

### 1.1 Goal

Recompress 1,242 legacy evidence images (uploaded before the
`20260514_visit_evidence_upload_metadata.sql` migration introduced
client-side compression + metadata tracking) using the exact same
pipeline as new uploads (`app/agent/campaigns/[id]/visit/start/page.tsx`
`compressEvidencePhoto`: resize to ≤1280px width, encode as WebP @
quality 0.7 / sharp quality 70), without ever permanently deleting the
original files.

### 1.2 Storage layout (single private `evidence` bucket)

| Path | Meaning |
|---|---|
| `{org_id}/{visit_id}/{filename}` | Existing original object (untouched until migration succeeds for that row) |
| `{org_id}/{visit_id}/recompressed-{visit_evidence_id}.webp` | New compressed object — **compressed path** |
| `archive/evidence-migration-2026-06/{org_id}/{visit_id}/{filename}` | Original object after a successful migration — **archive path** (preserves full original folder structure under an archive prefix) |

No new bucket is created. The `evidence` bucket is private and already
restricted to service-role + RLS-scoped access, so archived originals
remain just as protected as live evidence.

### 1.3 Migration tracking table

New table `public.evidence_recompression_migrations`
(migration `supabase/migrations/20260612_evidence_recompression_migration_log.sql`):

| Column | Purpose |
|---|---|
| `visit_evidence_id` | FK to the row being migrated |
| `organization_id` | tenant scoping |
| `batch_id` | `'2026-06'` — allows future batches without collisions |
| `original_path` | path of the original object at migration time |
| `archive_path` | where the original was moved to (null until step 6) |
| `compressed_path` | new object path (null until step 3) |
| `original_size` / `compressed_size` / `reduction_percent` | computed metrics |
| `original_mime_type` | the `mime_type` value on `visit_evidence` *before* migration (needed for rollback — most legacy rows have `mime_type = null`) |
| `original_file_url` | the `file_url` value on `visit_evidence` *before* migration (needed for rollback) |
| `status` | `pending` \| `completed` \| `failed` \| `rolled_back` |
| `error_message` | last error, if any |
| `attempt_count` | retry counter |
| `processed_at` | timestamp of last terminal state |

Unique index on `(visit_evidence_id, batch_id)` makes the table the
single source of truth for "has this row been migrated in this batch."

### 1.4 Per-row workflow

```
1. SELECT/UPSERT tracking row (status='pending') for this visit_evidence_id + batch_id.
   If status='completed' → skip entirely (idempotent / resumable).

2. Download original object (signed URL + raw https — the Supabase SDK's
   .storage.download() does not complete in this environment; see
   scripts/dry-run-evidence-recompression.mjs for the working approach).

3. Compress with sharp: resize to width = min(metadata.width, 1280),
   encode .webp({ quality: 70 }).

4. Verify in-memory:
     - sharp metadata on compressed buffer has valid width/height
     - compressed.length < original.length
   If either check fails → status='failed', error_message set, STOP
   (no writes of any kind for this row).

5. Upload compressed buffer to compressed_path (new object,
   upsert: false — fails loudly if it already exists from a half-done
   prior attempt, which is then treated as "already uploaded, re-verify").

6. Re-download the just-uploaded compressed object and re-run sharp
   metadata on it (upload integrity check). If it doesn't match
   expected size/dimensions → status='failed', STOP. The bad object at
   compressed_path is left for manual inspection (it does not affect
   any live data because visit_evidence.file_url has not been touched yet).

7. UPDATE visit_evidence SET
     file_url = compressed_path,
     file_size = compressed_size,
     original_file_size = coalesce(original_file_size, original_size),
     compressed_file_size = compressed_size,
     mime_type = 'image/webp',
     original_file_name = coalesce(original_file_name, file_name)
   WHERE id = visit_evidence_id;

   At this point the app already serves the compressed image. The
   original is still sitting at original_path, untouched.

8. storage.move(original_path → archive_path).
   This is a rename, not a copy+delete — the bytes are preserved.

9. UPDATE tracking row: status='completed', archive_path, compressed_path,
   original_size, compressed_size, reduction_percent, processed_at=now().
```

If any step 2–8 throws: tracking row → `status='failed'`,
`error_message` recorded, `attempt_count += 1`, move on to the next row.
**No partial visit_evidence updates and no storage moves happen for a
failed row** — step 7 (DB update) only runs after step 6 succeeds, and
step 8 (archive move) only runs after step 7 succeeds.

### 1.5 Idempotency & resumability

- Re-running the script re-fetches the eligible set, left-joins against
  `evidence_recompression_migrations` for `batch_id='2026-06'`, and
  skips any row with `status='completed'`.
- Rows with `status='failed'` are retried (up to `MAX_ATTEMPTS = 3`,
  then permanently skipped and surfaced in the report for manual review).
- Rows with `status='pending'` left over from a crashed run (no terminal
  state recorded) are retried from step 2 — this is safe because steps
  2–6 have no side effects on `visit_evidence` or the original object,
  and step 5's upload uses `upsert: false` so a half-uploaded
  `compressed_path` from a crash is detected and treated as failed
  (logged, and the script picks a fresh `compressed_path` suffix
  `-retry{n}` on the next attempt).

### 1.6 Throughput

Observed download speed in this environment: ~57KB/s. At
`CONCURRENCY = 5`, 1,242 files (~3,022 MB total) will take on the order
of **3-4 hours** for downloads alone, plus upload time for the (much
smaller, ~209 MB total) compressed outputs. The script logs progress
every 10 rows and is safe to interrupt (`Ctrl+C`) and re-run at any time.

---

## 2. Rollback Plan

Rollback is possible **per-row, at any time within the 30-day archive
retention window**, because:

- The original object always exists at `archive_path` after step 8.
- The pre-migration `visit_evidence.file_url` and `mime_type` values are
  recorded in the tracking row (`original_file_url`, `original_mime_type`)
  before they're overwritten in step 7.

### 2.1 Rolling back a single row

```
1. storage.move(archive_path → original_path)   -- restores the original object
2. UPDATE visit_evidence SET
     file_url = original_file_url,
     file_size = original_size,
     mime_type = original_mime_type,
     -- original_file_size / compressed_file_size / original_file_name are
     -- left as-is; they were either already null (legacy row) or
     -- harmless metadata
   WHERE id = visit_evidence_id;
3. storage.remove([compressed_path])             -- delete the now-unused compressed object
4. UPDATE evidence_recompression_migrations SET status='rolled_back', processed_at=now()
   WHERE id = ...;
```

This is the exact inverse of steps 7-8, executed in reverse order, and
is provided as `scripts/rollback-evidence-recompression.mjs` (to be
written only if needed — not part of this deliverable, but trivial given
the tracking table).

### 2.2 Rolling back the whole batch

Run the per-row rollback for every tracking row with
`status='completed' AND batch_id='2026-06'`. Since `evidence` bucket
storage moves are renames (cheap, no re-download required), a full
rollback of all 1,242 rows does **not** require re-downloading or
re-compressing anything and should complete in minutes, not hours.

### 2.3 Archive retention

Archived originals at `archive/evidence-migration-2026-06/**` are
**retained for 30 days** (until **2026-07-12**) before any further
action is considered. No automated deletion is part of this deliverable.
A future, separate, explicitly-approved cleanup step would be required
to remove the archive after the retention window — out of scope here.

---

## 3. Verification Plan

`scripts/verify-evidence-recompression.mjs` (read-only) checks, for
every `evidence_recompression_migrations` row with
`batch_id='2026-06'`:

1. **Count check**: total tracking rows == 1,242 (or fewer if some are
   intentionally excluded — reported explicitly), broken down by status
   (`completed` / `failed` / `pending`).
2. **DB → storage pointer check**: for each `completed` row, the
   corresponding `visit_evidence.file_url` equals `compressed_path`, and
   `supabase.storage.from('evidence')` can generate a signed URL / HEAD
   for that object (object exists, size matches `compressed_size`).
3. **Archive existence check**: `archive_path` object exists in storage
   for every `completed` row (proves nothing was deleted).
4. **Compressed object integrity**: re-run `sharp().metadata()` on a
   sample of compressed objects to confirm they're still valid, readable
   WebP images with sensible dimensions.
5. **Storage savings**: sum `original_size - compressed_size` across all
   `completed` rows, cross-checked against the dry-run estimate
   (2,812.76 MB).
6. **Summary report**: counts by status, total old/new size, % savings,
   list of any `failed` rows with `error_message` for manual triage.

This script makes **zero writes** — it is safe to run at any time,
including repeatedly during/after the migration.

---

## 4. Step-by-Step Execution Plan

1. **Apply the tracking-table migration**
   `supabase/migrations/20260612_evidence_recompression_migration_log.sql`
   (additive only — new table, no changes to existing tables).

2. **Visual QA (read-only)** — run
   `scripts/qa-sample-evidence-recompression.mjs`. Produces a report of
   20 randomly-sampled rows (diversified across campaigns/dates) showing
   original size, compressed size, reduction %, resolution, and the
   original/compressed/archive paths that *would* be used. **No files
   are modified.** Manually inspect a few of these compressed previews
   (the script can optionally write them to a local `tmp/qa-samples/`
   folder for visual review) before proceeding.

3. **Stop and get explicit approval** to proceed past this point — per
   your standing instruction, nothing below runs automatically.

4. **Run the migration** — `node scripts/migrate-evidence-recompression.mjs`,
   in the background, expected ~3-4 hours. Safe to interrupt/resume.

5. **Run verification** — `node scripts/verify-evidence-recompression.mjs`,
   confirm counts, savings, and zero unexpected `failed` rows (or triage
   any failures individually — failures don't block the rest of the batch).

6. **Spot-check in the app** — open a handful of migrated visits in the
   admin/agent UI and confirm evidence photos render correctly
   (the `next.config.ts` `remotePatterns` already allow `*.supabase.co`
   storage URLs, and `file_url` paths remain within the same `evidence`
   bucket, so no app code changes are required).

7. **Wait out the 30-day archive retention** (until 2026-07-12). After
   that, a *separate, explicitly-approved* step would permanently remove
   `archive/evidence-migration-2026-06/**`. Not part of this deliverable.

---

## 5. Files in this deliverable

| File | Purpose | Writes? |
|---|---|---|
| `supabase/migrations/20260612_evidence_recompression_migration_log.sql` | Tracking table (additive) | Schema only — additive |
| `scripts/qa-sample-evidence-recompression.mjs` | 20-sample visual QA report | None (downloads to memory only; optional local file write for preview images, not DB/storage) |
| `scripts/migrate-evidence-recompression.mjs` | The actual migration | Yes — **not to be run without explicit approval** |
| `scripts/verify-evidence-recompression.mjs` | Post-migration verification | None |
