import { NextRequest, NextResponse } from "next/server";

import { getPrimaryOrgMembership } from "@/lib/auth/org-context";
import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["agent", "admin", "super_admin"])) return forbidden();
  const membership = await getPrimaryOrgMembership(user.id);
  if (!membership) return forbidden();

  const supabase = createServerSupabaseClient();
  const [{ data: assignments }, { data: campaigns }] = await Promise.all([
    supabase
      .from("campaign_assignments")
      .select("campaign_id, status")
      .eq("organization_id", membership.organizationId)
      .eq("user_id", user.id)
      .eq("role", "agent")
      .eq("status", "active"),
    supabase
      .from("campaigns")
      .select("id, name, status, start_date, end_date, state, lga, target_outlets")
      .eq("organization_id", membership.organizationId)
      .eq("status", "active")
      .order("created_at", { ascending: false }),
  ]);

  const assignedCampaignIds = new Set((assignments ?? []).map((x) => x.campaign_id));

  // Count visits per campaign scoped to this agent only.
  // Filter to assigned campaign IDs first to keep the query bounded.
  const assignedIdList = (campaigns ?? [])
    .filter((c) => assignedCampaignIds.has(c.id))
    .map((c) => c.id);

  const visitCounts = new Map<string, number>();
  if (assignedIdList.length > 0) {
    const { data: visitRows } = await supabase
      .from("visits")
      .select("campaign_id")
      .eq("organization_id", membership.organizationId)
      .eq("agent_id", user.id)
      .in("campaign_id", assignedIdList)
      .limit(5000);
    for (const row of visitRows ?? []) {
      visitCounts.set(row.campaign_id, (visitCounts.get(row.campaign_id) ?? 0) + 1);
    }
  }

  const items = (campaigns ?? [])
    .filter((campaign) => assignedCampaignIds.has(campaign.id))
    .map((campaign) => {
      const completedVisits = visitCounts.get(campaign.id) ?? 0;
      const targetOutlets = Number(campaign.target_outlets ?? 0);
      const progressPercent = targetOutlets > 0 ? Math.min(100, (completedVisits / targetOutlets) * 100) : 0;
      return {
        ...campaign,
        completedVisits,
        progressPercent,
      };
    });

  return NextResponse.json({ success: true, campaigns: items });
}
