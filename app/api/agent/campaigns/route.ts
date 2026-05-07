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
      .select("id, name, status, start_date, end_date, state, lga")
      .eq("organization_id", membership.organizationId)
      .in("status", ["active", "draft"])
      .order("created_at", { ascending: false }),
  ]);

  const assignedCampaignIds = new Set((assignments ?? []).map((x) => x.campaign_id));
  const items = (campaigns ?? []).filter((campaign) => assignedCampaignIds.has(campaign.id));

  return NextResponse.json({ success: true, campaigns: items });
}

