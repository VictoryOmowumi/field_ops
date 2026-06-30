import { NextRequest, NextResponse } from "next/server";

import { getOrgMembershipForUser, hasAllowedOrgRole } from "@/lib/auth/org-access";
import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { resolveDateWindow } from "@/lib/server/query-window";
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
  if (!hasRequiredRole(user, ["admin", "super_admin"])) return forbidden();
  const membership = await getOrgMembershipForUser(user.id);
  if (!membership || !hasAllowedOrgRole(membership.role, ["org_admin", "supervisor"])) return forbidden();

  const supabase = createServerSupabaseClient();
  const campaignId = request.nextUrl.searchParams.get("campaignId");
  const dateWindow = resolveDateWindow(
    request.nextUrl.searchParams.get("dateFrom"),
    request.nextUrl.searchParams.get("dateTo"),
    30
  );

  let visitsQuery = supabase
    .from("visits")
    .select("id, created_at, outlet_id")
    .eq("organization_id", membership.organizationId);
  if (campaignId && campaignId !== "all") visitsQuery = visitsQuery.eq("campaign_id", campaignId);
  if (dateWindow.dateFrom) visitsQuery = visitsQuery.gte("created_at", `${dateWindow.dateFrom}T00:00:00.000Z`);
  if (dateWindow.dateTo) visitsQuery = visitsQuery.lte("created_at", `${dateWindow.dateTo}T23:59:59.999Z`);

  let salesQuery = supabase
    .from("sales")
    .select("id, created_at, product_name, quantity, sales_value, visit_id, outlet_id")
    .eq("organization_id", membership.organizationId);
  if (campaignId && campaignId !== "all") salesQuery = salesQuery.eq("campaign_id", campaignId);
  if (dateWindow.dateFrom) salesQuery = salesQuery.gte("created_at", `${dateWindow.dateFrom}T00:00:00.000Z`);
  if (dateWindow.dateTo) salesQuery = salesQuery.lte("created_at", `${dateWindow.dateTo}T23:59:59.999Z`);

  const [{ data: visits, error: visitsError }, { data: sales, error: salesError }] = await Promise.all([
    visitsQuery,
    salesQuery,
  ]);
  if (visitsError) return NextResponse.json({ success: false, message: visitsError.message }, { status: 500 });
  if (salesError) return NextResponse.json({ success: false, message: salesError.message }, { status: 500 });

  const convertedVisitIds = new Set(
    (sales ?? [])
      .filter((item) => Number(item.quantity ?? 0) > 0 || Number(item.sales_value ?? 0) > 0)
      .map((item) => item.visit_id)
      .filter(Boolean)
  );
  const convertedOutletIds = new Set(
    (sales ?? [])
      .filter((item) => Number(item.quantity ?? 0) > 0 || Number(item.sales_value ?? 0) > 0)
      .map((item) => item.outlet_id)
      .filter(Boolean)
  );
  const achievedOutletIds = new Set<string>();
  let totalValue = 0;

  for (const item of visits ?? []) {
    const typed = item as { outlet_id?: string | null };
    if (typed.outlet_id) achievedOutletIds.add(typed.outlet_id);
  }
  for (const item of sales ?? []) totalValue += Number(item.sales_value ?? 0);

  return NextResponse.json({
    success: true,
    overview: {
      totalVisits: (visits ?? []).length,
      conversions: convertedOutletIds.size,
      conversionRate: achievedOutletIds.size ? (convertedOutletIds.size / achievedOutletIds.size) * 100 : 0,
      salesValue: totalValue,
    },
    appliedDateWindow: dateWindow,
  });
}
