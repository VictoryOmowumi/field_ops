import { NextRequest, NextResponse } from "next/server";

import { getOrgMembershipForUser, hasAllowedOrgRole } from "@/lib/auth/org-access";
import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { getCampaignActivities } from "@/lib/campaign/intelligence";
import { resolveCampaignDefaultWindow, resolveDateWindow } from "@/lib/server/query-window";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
}

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["admin", "super_admin"])) return forbidden();

  const membership = await getOrgMembershipForUser(user.id);
  if (!membership || !hasAllowedOrgRole(membership.role, ["org_admin", "supervisor"])) return forbidden();

  const { id } = await context.params;
  const supabase = createServerSupabaseClient();
  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") ?? "1"));
  const pageSize = Math.min(100, Math.max(10, Number(request.nextUrl.searchParams.get("pageSize") ?? "20")));
  const queryDateFrom = request.nextUrl.searchParams.get("dateFrom");
  const queryDateTo = request.nextUrl.searchParams.get("dateTo");

  // No explicit range given — for a finished campaign, default to its own lifetime rather than
  // "last 2 days from today," which is almost always empty once a campaign has been over a while.
  let dateWindow = resolveDateWindow(queryDateFrom, queryDateTo, 2);
  if (!queryDateFrom && !queryDateTo) {
    const { data: campaignRow } = await supabase
      .from("campaigns")
      .select("status, start_date, end_date, created_at")
      .eq("id", id)
      .eq("organization_id", membership.organizationId)
      .maybeSingle();
    if (campaignRow && (campaignRow.status === "completed" || campaignRow.status === "archived")) {
      const override = resolveCampaignDefaultWindow(campaignRow);
      dateWindow = resolveDateWindow(override.dateFrom, override.dateTo, 2);
    }
  }
  const status = request.nextUrl.searchParams.get("status");
  const search = request.nextUrl.searchParams.get("search");

  const { rows, total } = await getCampaignActivities(supabase, membership.organizationId, id, {
    page,
    pageSize,
    dateFrom: dateWindow.dateFrom,
    dateTo: dateWindow.dateTo,
    status,
    search,
  });

  return NextResponse.json({
    success: true,
    activities: rows,
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
    appliedDateWindow: dateWindow,
  });
}
