import { createHash } from "crypto";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { writePlatformAuditLog } from "@/lib/platform/server";
import { r2Provider, supabaseProvider } from "@/lib/storage";

export type MigrationItemResult = {
  visitEvidenceId: string;
  status: "verified" | "failed";
  error?: string;
};

export type MediaMigrationSummary = {
  jobId: string;
  mode: "dry_run" | "live";
  candidateCount: number;
  migratedCount: number;
  failedCount: number;
  items: MigrationItemResult[];
};

const DEFAULT_BATCH_SIZE = 25;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Phase 9. Only ever touches evidence belonging to already-*archived* campaigns (Phase 8) — a
 * campaign that's merely completed and still inside its retention window never becomes a
 * candidate, regardless of this job running. Copy -> verify -> only then flip storage_provider;
 * the Supabase original is never deleted here (see purgeVerifiedSupabaseOriginals) — that's a
 * deliberately separate, manual, later step with its own grace period.
 */
export async function runMediaMigrationBatch(opts: {
  mode: "dry_run" | "live";
  batchSize?: number;
  actorUserId?: string;
}): Promise<MediaMigrationSummary> {
  const supabase = createServerSupabaseClient();
  const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;

  const { data: job, error: jobError } = await supabase
    .from("evidence_migration_jobs")
    .insert({ mode: opts.mode, status: "running", triggered_by: opts.actorUserId ?? null })
    .select("id")
    .single();
  if (jobError || !job) throw new Error(jobError?.message ?? "Failed to open a migration job.");

  const { data: candidates, error: candidatesError } = await supabase
    .from("visit_evidence")
    .select("id, file_url, mime_type, campaigns!inner(status)")
    .eq("storage_provider", "supabase")
    .eq("archive_status", "hot")
    .is("deleted_at", null)
    .eq("campaigns.status", "archived")
    .limit(batchSize);
  if (candidatesError) throw new Error(candidatesError.message);

  const candidateRows = candidates ?? [];
  if (candidateRows.length > 0) {
    await supabase.from("evidence_migration_items").insert(
      candidateRows.map((row) => ({ job_id: job.id, visit_evidence_id: row.id, status: "pending" }))
    );
  }

  const items: MigrationItemResult[] = [];

  if (opts.mode === "live") {
    for (const row of candidateRows) {
      try {
        const { bytes, contentType } = await supabaseProvider.downloadEvidenceFile({ file_url: row.file_url });
        const sourceChecksum = createHash("sha256").update(Buffer.from(bytes)).digest("hex");
        const destChecksum = createHash("md5").update(Buffer.from(bytes)).digest("hex");

        const result = await r2Provider.putEvidenceFileAtKey(row.file_url, bytes, contentType ?? row.mime_type ?? null);
        const verified = result.etag !== null && result.etag === destChecksum;

        if (!verified) {
          items.push({ visitEvidenceId: row.id, status: "failed", error: "checksum mismatch after copy to R2" });
          await supabase
            .from("evidence_migration_items")
            .update({ status: "failed", source_checksum: sourceChecksum, dest_checksum: result.etag, error: "checksum mismatch after copy to R2" })
            .eq("job_id", job.id)
            .eq("visit_evidence_id", row.id);
          continue;
        }

        await supabase
          .from("visit_evidence")
          .update({
            storage_provider: "r2",
            bucket: result.bucket,
            object_key: result.objectKey,
            archived_at: new Date().toISOString(),
            archive_status: "archived",
            checksum: sourceChecksum,
          })
          .eq("id", row.id);

        await supabase
          .from("evidence_migration_items")
          .update({ status: "verified", source_checksum: sourceChecksum, dest_checksum: result.etag })
          .eq("job_id", job.id)
          .eq("visit_evidence_id", row.id);

        items.push({ visitEvidenceId: row.id, status: "verified" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown migration error.";
        items.push({ visitEvidenceId: row.id, status: "failed", error: message });
        await supabase
          .from("evidence_migration_items")
          .update({ status: "failed", error: message })
          .eq("job_id", job.id)
          .eq("visit_evidence_id", row.id);
      }

      // Deliberately sequential with a small pause between items, not Promise.all — this is a
      // background job with no urgency, and hammering the Supabase Storage API concurrently is
      // exactly the "job overwhelms live traffic" risk called out for this phase.
      await sleep(150);
    }
  }

  const migratedCount = items.filter((item) => item.status === "verified").length;
  const failedCount = items.filter((item) => item.status === "failed").length;

  await supabase
    .from("evidence_migration_jobs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      candidate_count: candidateRows.length,
      migrated_count: migratedCount,
      failed_count: failedCount,
    })
    .eq("id", job.id);

  await writePlatformAuditLog({
    actorUserId: opts.actorUserId ?? "00000000-0000-0000-0000-000000000000",
    targetType: "evidence_migration_job",
    targetId: job.id,
    action: opts.mode === "live" ? "evidence_migration.run" : "evidence_migration.dry_run",
    afterState: { candidateCount: candidateRows.length, migratedCount, failedCount },
  });

  return {
    jobId: job.id,
    mode: opts.mode,
    candidateCount: candidateRows.length,
    migratedCount,
    failedCount,
    items,
  };
}

/**
 * Deliberately separate from the migration above, manual-trigger only, and never run in the same
 * pass as a copy. Deletes the Supabase original only for rows that have already been verified on
 * R2 for at least `minAgeDays` — the grace period the rollout plan calls for.
 */
export async function purgeVerifiedSupabaseOriginals(input: {
  minAgeDays: number;
  actorUserId: string;
  dryRun?: boolean;
}) {
  const supabase = createServerSupabaseClient();
  const cutoff = new Date(Date.now() - input.minAgeDays * 24 * 60 * 60 * 1000).toISOString();

  const { data: rows, error } = await supabase
    .from("visit_evidence")
    .select("id, file_url, original_path")
    .eq("storage_provider", "r2")
    .eq("archive_status", "archived")
    .lt("archived_at", cutoff)
    .is("original_path", null); // not yet purged
  if (error) throw new Error(error.message);

  const candidates = rows ?? [];
  if (input.dryRun) {
    return { purged: 0, candidateCount: candidates.length, dryRun: true };
  }

  let purged = 0;
  for (const row of candidates) {
    const result = await supabaseProvider.deleteEvidenceFile({ file_url: row.file_url });
    if (result.deleted) {
      await supabase.from("visit_evidence").update({ original_path: row.file_url }).eq("id", row.id);
      purged += 1;
    }
    await sleep(150);
  }

  await writePlatformAuditLog({
    actorUserId: input.actorUserId,
    targetType: "evidence_migration_purge",
    targetId: `min_age_${input.minAgeDays}d`,
    action: "evidence_migration.purge_supabase_originals",
    afterState: { candidateCount: candidates.length, purged },
  });

  return { purged, candidateCount: candidates.length, dryRun: false };
}
