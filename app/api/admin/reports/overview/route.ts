import { NextRequest, NextResponse } from "next/server";

import { getOrgMembershipForUser, hasAllowedOrgRole } from "@/lib/auth/org-access";
import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { resolveDateWindow } from "@/lib/server/query-window";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { captureException } from "@/lib/observability/sentry";

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
  const organizationId = membership.organizationId;
  const campaignIdParam = request.nextUrl.searchParams.get("campaignId");
  const campaignId = campaignIdParam && campaignIdParam !== "all" ? campaignIdParam : null;
  const dateWindow = resolveDateWindow(
    request.nextUrl.searchParams.get("dateFrom"),
    request.nextUrl.searchParams.get("dateTo"),
    30
  );

  const rpcParams = {
    p_organization_id: organizationId,
    p_campaign_id: campaignId,
    p_date_from: dateWindow.dateFrom ? `${dateWindow.dateFrom}T00:00:00.000Z` : null,
    p_date_to: dateWindow.dateTo ? `${dateWindow.dateTo}T23:59:59.999Z` : null,
  };

  try {
    // achievedOutletIds (distinct outlet visited) and total_visits come from
    // visit_metrics_summary; converted outlets and total sales value come from
    // dashboard_summary_extras — both already exist, no new RPC needed here.
    const [countsRes, extrasRes] = await Promise.all([
      supabase.rpc("visit_metrics_summary", rpcParams).single(),
      supabase.rpc("dashboard_summary_extras", rpcParams).single(),
    ]);
    if (countsRes.error) throw new Error(`Failed to load visit metrics: ${countsRes.error.message}`);
    if (extrasRes.error) throw new Error(`Failed to load sales metrics: ${extrasRes.error.message}`);

    const counts = countsRes.data as { total_visits: number; unique_outlets: number } | null;
    const extras = extrasRes.data as { distinct_converted_outlets: number; total_sales_value: number } | null;

    const achievedOutlets = Number(counts?.unique_outlets ?? 0);
    const convertedOutlets = Number(extras?.distinct_converted_outlets ?? 0);

    return NextResponse.json({
      success: true,
      overview: {
        totalVisits: Number(counts?.total_visits ?? 0),
        conversions: convertedOutlets,
        conversionRate: achievedOutlets > 0 ? (convertedOutlets / achievedOutlets) * 100 : 0,
        salesValue: Number(extras?.total_sales_value ?? 0),
      },
      appliedDateWindow: dateWindow,
    });
  } catch (error) {
    captureException(error, { organizationId, route: "/api/admin/reports/overview" });
    return NextResponse.json({ success: false, message: "Failed to load report overview." }, { status: 500 });
  }
}
