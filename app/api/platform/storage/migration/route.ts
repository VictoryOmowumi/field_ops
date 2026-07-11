import { NextRequest, NextResponse } from "next/server";

import { getPlatformSettingValue, requireSuperAdmin } from "@/lib/platform/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { runMediaMigrationBatch } from "@/lib/storage/media-migration";

export async function GET(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (auth.error) return auth.error;

  const supabase = createServerSupabaseClient();
  const { data: jobs, error } = await supabase
    .from("evidence_migration_jobs")
    .select("id, mode, status, candidate_count, migrated_count, failed_count, started_at, completed_at")
    .order("started_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

  return NextResponse.json({ success: true, jobs: jobs ?? [] });
}

type RunMigrationPayload = { mode?: "dry_run" | "live"; batchSize?: number };

export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (auth.error) return auth.error;

  const payload = (await request.json().catch(() => ({}))) as RunMigrationPayload;
  const storageEnabled = await getPlatformSettingValue("commercial.storage.enabled");
  // Same guardrail as the Phase 8 cron: the flag is the only thing that can turn a real (write)
  // run on. Requesting 'live' while it's off silently downgrades to dry_run instead of erroring,
  // since "show me what would happen" is still a legitimate, safe request either way.
  const mode = payload.mode === "live" && storageEnabled === "true" ? "live" : "dry_run";

  try {
    const summary = await runMediaMigrationBatch({ mode, batchSize: payload.batchSize, actorUserId: auth.user.id });
    return NextResponse.json({ success: true, ...summary });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Migration batch failed." },
      { status: 500 }
    );
  }
}
