import { NextRequest, NextResponse } from "next/server";

import { requireSuperAdmin, titleCase } from "@/lib/platform/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin(request);
  if (auth.error) return auth.error;

  const { id } = await params;
  const supabase = createServerSupabaseClient();
  const { data: campaigns, error } = await supabase
    .from("campaigns")
    .select("id, name, status")
    .eq("organization_id", id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

  const campaignIds = (campaigns ?? []).map((c) => c.id);
  const [{ data: assignments }, { data: visits }] = await Promise.all([
    campaignIds.length
      ? supabase.from("campaign_assignments").select("campaign_id, role").in("campaign_id", campaignIds)
      : Promise.resolve({ data: [] as Array<{ campaign_id: string; role: string }> }),
    campaignIds.length
      ? supabase.from("visits").select("campaign_id, outcome").in("campaign_id", campaignIds)
      : Promise.resolve({ data: [] as Array<{ campaign_id: string; outcome: string | null }> }),
  ]);

  const repCountByCampaign = new Map<string, number>();
  for (const row of assignments ?? []) {
    if (row.role !== "agent") continue;
    repCountByCampaign.set(row.campaign_id, (repCountByCampaign.get(row.campaign_id) ?? 0) + 1);
  }
  const conversionCountByCampaign = new Map<string, number>();
  for (const row of visits ?? []) {
    if (row.outcome !== "converted") continue;
    conversionCountByCampaign.set(row.campaign_id, (conversionCountByCampaign.get(row.campaign_id) ?? 0) + 1);
  }

  const rows = (campaigns ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    status: titleCase(c.status),
    reps: repCountByCampaign.get(c.id) ?? 0,
    conversions: conversionCountByCampaign.get(c.id) ?? 0,
  }));

  return NextResponse.json({ success: true, campaigns: rows });
}

