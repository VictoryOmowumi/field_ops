import { NextRequest, NextResponse } from "next/server";

import { requireSuperAdmin } from "@/lib/platform/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin(request);
  if (auth.error) return auth.error;

  const { id } = await params;
  const supabase = createServerSupabaseClient();

  const [{ count: totalCampaigns }, { count: totalReps }, { count: totalOutlets }, { count: totalSales }, { data: evidenceRows }, { count: monthlyVisits }, { count: monthlySales }] =
    await Promise.all([
      supabase.from("campaigns").select("id", { count: "exact", head: true }).eq("organization_id", id),
      supabase.from("organization_users").select("id", { count: "exact", head: true }).eq("organization_id", id).eq("role", "agent"),
      supabase.from("outlets").select("id", { count: "exact", head: true }).eq("organization_id", id),
      supabase.from("sales").select("id", { count: "exact", head: true }).eq("organization_id", id),
      supabase.from("visit_evidence").select("file_size").eq("organization_id", id),
      supabase.from("visits").select("id", { count: "exact", head: true }).eq("organization_id", id).gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
      supabase.from("sales").select("id", { count: "exact", head: true }).eq("organization_id", id).gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
    ]);

  const storageBytes = (evidenceRows ?? []).reduce((sum, row) => sum + (Number(row.file_size ?? 0) || 0), 0);
  const storageGb = storageBytes / (1024 * 1024 * 1024);
  const storageLabel = storageGb >= 1 ? `${storageGb.toFixed(2)} GB` : `${(storageBytes / (1024 * 1024)).toFixed(2)} MB`;
  const monthlyEvents = (monthlyVisits ?? 0) + (monthlySales ?? 0);
  const monthlyActivity = monthlyEvents > 2000 ? "High" : monthlyEvents > 500 ? "Medium" : "Low";

  const usage = [
    { metric: "Total campaigns", value: String(totalCampaigns ?? 0) },
    { metric: "Total reps", value: String(totalReps ?? 0) },
    { metric: "Total outlets", value: String(totalOutlets ?? 0) },
    { metric: "Total sales", value: String(totalSales ?? 0) },
    { metric: "Storage usage", value: storageLabel },
    { metric: "Monthly activity", value: monthlyActivity },
  ];

  return NextResponse.json({ success: true, usage });
}
