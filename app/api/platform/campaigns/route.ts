import { NextRequest, NextResponse } from "next/server";

import { requireSuperAdmin, titleCase } from "@/lib/platform/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { PlatformCampaignRow } from "@/types/platform";

export async function GET(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (auth.error) return auth.error;

  const supabase = createServerSupabaseClient();
  const { data: campaigns, error } = await supabase
    .from("campaigns")
    .select("id, organization_id, name, status")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

  const orgIds = [...new Set((campaigns ?? []).map((c) => c.organization_id))];
  const campaignIds = (campaigns ?? []).map((c) => c.id);

  const [{ data: organizations }, { data: assignments }, { data: visits }] = await Promise.all([
    orgIds.length ? supabase.from("organizations").select("id, name").in("id", orgIds) : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    campaignIds.length
      ? supabase.from("campaign_assignments").select("campaign_id, user_id, role").in("campaign_id", campaignIds)
      : Promise.resolve({ data: [] as Array<{ campaign_id: string; user_id: string; role: string }> }),
    campaignIds.length
      ? supabase.from("visits").select("campaign_id, outcome, sync_status").in("campaign_id", campaignIds)
      : Promise.resolve({ data: [] as Array<{ campaign_id: string; outcome: string | null; sync_status: string | null }> }),
  ]);

  const orgMap = new Map((organizations ?? []).map((org) => [org.id, org.name]));
  const repCountByCampaign = new Map<string, number>();
  for (const row of assignments ?? []) {
    if (row.role !== "agent") continue;
    repCountByCampaign.set(row.campaign_id, (repCountByCampaign.get(row.campaign_id) ?? 0) + 1);
  }

  const visitsByCampaign = new Map<string, Array<{ outcome: string | null; sync_status: string | null }>>();
  for (const row of visits ?? []) {
    const list = visitsByCampaign.get(row.campaign_id) ?? [];
    list.push({ outcome: row.outcome, sync_status: row.sync_status });
    visitsByCampaign.set(row.campaign_id, list);
  }

  const rows: PlatformCampaignRow[] = (campaigns ?? []).map((c) => {
    const visitList = visitsByCampaign.get(c.id) ?? [];
    const synced = visitList.filter((v) => v.sync_status === "synced").length;
    const sync = visitList.length > 0 ? `${((synced / visitList.length) * 100).toFixed(1)}%` : "-";
    const conversions = visitList.filter((v) => v.outcome === "converted").length;
    return {
      id: c.id,
      organizationId: c.organization_id,
      organization: orgMap.get(c.organization_id) ?? "-",
      campaign: c.name,
      status: titleCase(c.status),
      sync,
      reps: repCountByCampaign.get(c.id) ?? 0,
      outlets: visitList.length,
      conversions,
    };
  });

  return NextResponse.json({ success: true, campaigns: rows });
}

