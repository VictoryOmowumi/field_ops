import { NextRequest, NextResponse } from "next/server";

import { requireSuperAdmin } from "@/lib/platform/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ jobId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireSuperAdmin(request);
  if (auth.error) return auth.error;

  const { jobId } = await context.params;
  const supabase = createServerSupabaseClient();

  const [{ data: job, error: jobError }, { data: items, error: itemsError }] = await Promise.all([
    supabase
      .from("evidence_migration_jobs")
      .select("id, mode, status, candidate_count, migrated_count, failed_count, started_at, completed_at")
      .eq("id", jobId)
      .maybeSingle(),
    supabase
      .from("evidence_migration_items")
      .select("id, visit_evidence_id, status, source_checksum, dest_checksum, error, created_at")
      .eq("job_id", jobId)
      .order("created_at", { ascending: true }),
  ]);

  if (jobError) return NextResponse.json({ success: false, message: jobError.message }, { status: 500 });
  if (!job) return NextResponse.json({ success: false, message: "Migration job not found." }, { status: 404 });
  if (itemsError) return NextResponse.json({ success: false, message: itemsError.message }, { status: 500 });

  return NextResponse.json({ success: true, job, items: items ?? [] });
}
