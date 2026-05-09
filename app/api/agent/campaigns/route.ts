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
  const [{ data: assignments }, { data: campaigns }, { data: visits }] = await Promise.all([
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
      .in("status", ["active", "draft"])
      .order("created_at", { ascending: false }),
    supabase
      .from("visits")
      .select("campaign_id")
      .eq("organization_id", membership.organizationId)
      .eq("agent_id", user.id),
  ]);

  const assignedCampaignIds = new Set((assignments ?? []).map((x) => x.campaign_id));
  const visitCounts = new Map<string, number>();
  for (const row of visits ?? []) {
    const current = visitCounts.get(row.campaign_id) ?? 0;
    visitCounts.set(row.campaign_id, current + 1);
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
