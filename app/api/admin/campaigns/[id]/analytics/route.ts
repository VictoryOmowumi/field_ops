import { NextRequest, NextResponse } from "next/server";

import { getOrgMembershipForUser, hasAllowedOrgRole } from "@/lib/auth/org-access";
import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { getCampaignAnalyticsSummary, getCampaignMapPoints } from "@/lib/campaign/intelligence";
import { resolveDateWindow } from "@/lib/server/query-window";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };

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
  const dateFrom = request.nextUrl.searchParams.get("dateFrom");
  const dateTo = request.nextUrl.searchParams.get("dateTo");
  const mapDateWindow = resolveDateWindow(dateFrom, dateTo, 2);
  const mapPage = Math.max(1, Number(request.nextUrl.searchParams.get("mapPage") ?? "1"));
  const mapPageSize = Math.min(500, Math.max(20, Number(request.nextUrl.searchParams.get("mapPageSize") ?? "200")));

  const [summary, mapPoints] = await Promise.all([
    getCampaignAnalyticsSummary(supabase, membership.organizationId, id, { dateFrom, dateTo }),
    getCampaignMapPoints(supabase, membership.organizationId, id, {
      dateFrom: mapDateWindow.dateFrom,
      dateTo: mapDateWindow.dateTo,
      page: mapPage,
      pageSize: mapPageSize,
    }),
  ]);

  return NextResponse.json({
    success: true,
    summary,
    mapPoints,
    mapPagination: { page: mapPage, pageSize: mapPageSize, hasMore: mapPoints.length === mapPageSize },
    mapAppliedDateWindow: mapDateWindow,
  });
}
