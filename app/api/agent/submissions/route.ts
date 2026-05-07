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

  const campaignIdFilter = request.nextUrl.searchParams.get("campaignId");

  const supabase = createServerSupabaseClient();
  let query = supabase
    .from("visits")
    .select("id, campaign_id, outlet_id, task_type, outcome, visit_outcome_code, visit_outcome_label, notes, state, lga, latitude, longitude, sync_status, created_at, outlets(name), campaigns(name)")
    .eq("organization_id", membership.organizationId)
    .eq("agent_id", user.id);
  if (campaignIdFilter) {
    query = query.eq("campaign_id", campaignIdFilter);
  }
  const { data: visits, error } = await query.order("created_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

  return NextResponse.json({
    success: true,
    submissions: (visits ?? []).map((item) => ({
      id: item.id,
      campaignId: item.campaign_id,
      outletId: item.outlet_id,
      taskType: item.task_type,
      outcome: item.outcome,
      outcomeCode: item.visit_outcome_code,
      outcomeLabel: item.visit_outcome_label,
      notes: item.notes,
      state: item.state,
      lga: item.lga,
      latitude: item.latitude,
      longitude: item.longitude,
      syncStatus: item.sync_status,
      createdAt: item.created_at,
      outlet: (item as { outlets?: { name?: string } }).outlets?.name ?? "-",
      campaign: (item as { campaigns?: { name?: string } }).campaigns?.name ?? "-",
    })),
  });
}
