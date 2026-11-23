import { NextRequest, NextResponse } from "next/server";

import { isInternalRequestAuthorized } from "@/lib/observability/internal-auth";
import { getPlatformSettingValue } from "@/lib/platform/server";
import { runMediaMigrationBatch } from "@/lib/storage/media-migration";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// Batch tuned for Vercel Pro: ~1.5s/item observed in practice (download + double-checksum + R2
// upload + verify + 3 row writes), so 100 items comfortably fits inside maxDuration with room
// for network variance. Runs hourly from GitHub Actions (.github/workflows/scheduled-jobs.yml),
// and an idle run exits after one count query without writing a job or audit row.
export const maxDuration = 180;
const BATCH_SIZE = 100;

// Triggered by GitHub Actions. Same guardrail pattern as /api/internal/campaigns/archive —
// the flag decides live vs. dry_run, never the caller.
export async function GET(request: NextRequest) {
  if (!isInternalRequestAuthorized(request)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  // A prior invocation (scheduled or manual) could still legitimately be mid-batch — or it could
  // have been killed by a platform timeout without ever
  // reaching its own "completed"/"failed" update. A job older than maxDuration plus a buffer
  // can't still be genuinely running, so treat it as abandoned rather than letting one stuck row
  // block every future run.
  const supabase = createServerSupabaseClient();
  const staleCutoff = new Date(Date.now() - (maxDuration + 30) * 1000).toISOString();
  const { data: activeJob } = await supabase
    .from("evidence_migration_jobs")
    .select("id")
    .eq("status", "running")
    .gte("started_at", staleCutoff)
    .limit(1)
    .maybeSingle();
  if (activeJob) {
    return NextResponse.json({ success: true, skipped: true, reason: "A migration batch is already running." });
  }
  await supabase
    .from("evidence_migration_jobs")
    .update({ status: "failed", completed_at: new Date().toISOString() })
    .eq("status", "running")
    .lt("started_at", staleCutoff);

  const storageEnabled = await getPlatformSettingValue("commercial.storage.enabled");
  const mode = storageEnabled === "true" ? "live" : "dry_run";
  const summary = await runMediaMigrationBatch({ mode, batchSize: BATCH_SIZE, skipWhenEmpty: true });

  return NextResponse.json({ success: true, ranAt: new Date().toISOString(), ...summary });
}
