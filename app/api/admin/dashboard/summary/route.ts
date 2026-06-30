import { NextRequest, NextResponse } from "next/server";

import { getOrgMembershipForUser, hasAllowedOrgRole } from "@/lib/auth/org-access";
import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { resolveDateWindow } from "@/lib/server/query-window";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { withPerformanceTracking } from "@/lib/observability/performance";
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
    2
  );
  const dateFrom = dateWindow.dateFrom;
  const dateTo = dateWindow.dateTo;

  let campaignsQuery = supabase.from("campaigns").select("id, status").eq("organization_id", organizationId);
  if (campaignId) campaignsQuery = campaignsQuery.eq("id", campaignId);

  // Shared by both RPCs below — neither one transfers row data, both scale
  // with the aggregate result size, not with how many visits/sales exist in
  // the date range. This is what lets a 39k-row campaign respond as fast as
  // a 2-day slice.
  const rpcParams = {
    p_organization_id: organizationId,
    p_campaign_id: campaignId,
    p_date_from: dateFrom ? `${dateFrom}T00:00:00.000Z` : null,
    p_date_to: dateTo ? `${dateTo}T23:59:59.999Z` : null,
  };

  try {
    const [campaignsRes, countsRes, extrasRes] = await withPerformanceTracking(
      "query",
      "admin_dashboard_summary",
      () =>
        Promise.all([
          campaignsQuery,
          supabase.rpc("visit_metrics_summary", rpcParams).single(),
          supabase.rpc("dashboard_summary_extras", rpcParams).single(),
        ]),
      organizationId
    );

    if (campaignsRes.error) throw new Error(`Failed to load campaigns: ${campaignsRes.error.message}`);
    if (countsRes.error) throw new Error(`Failed to load visit metrics: ${countsRes.error.message}`);
    if (extrasRes.error) throw new Error(`Failed to load sales metrics: ${extrasRes.error.message}`);

    const campaigns = campaignsRes.data ?? [];
    const counts = countsRes.data as {
      total_visits: number;
      unique_outlets: number;
      unique_areas: number;
      synced_visits: number;
      posm_checks: number;
      posm_deployed: number;
      posm_units: number;
      distributed_free_samples: number;
    } | null;
    const extras = extrasRes.data as {
      total_sales_records: number;
      qualifying_sales_count: number;
      units_sold: number;
      distinct_converted_outlets: number;
      total_sales_value: number;
      active_agents: number;
    } | null;

    const totalVisits = Number(counts?.total_visits ?? 0);
    const uniqueOutlets = Number(counts?.unique_outlets ?? 0);
    const posmChecks = Number(counts?.posm_checks ?? 0);
    const posmDeployed = Number(counts?.posm_deployed ?? 0);
    const conversions = Number(extras?.distinct_converted_outlets ?? 0);

    return NextResponse.json({
      success: true,
      summary: {
        activeCampaigns: campaigns.filter((c) => c.status === "active").length,
        totalCampaigns: campaigns.length,
        activeReps: Number(extras?.active_agents ?? 0),
        totalOutlets: uniqueOutlets,
        totalVisits,
        totalSalesRecords: Number(extras?.total_sales_records ?? 0),
        conversions,
        salesCount: Number(extras?.qualifying_sales_count ?? 0),
        unitsSold: Number(extras?.units_sold ?? 0),
        conversionRate: uniqueOutlets > 0 ? (conversions / uniqueOutlets) * 100 : 0,
        salesValue: Number(extras?.total_sales_value ?? 0),
        syncHealth: totalVisits > 0 ? (Number(counts?.synced_visits ?? 0) / totalVisits) * 100 : 100,
        posmChecks,
        posmDeployed,
        posmUnits: Number(counts?.posm_units ?? 0),
        posmDeploymentRate: posmChecks > 0 ? (posmDeployed / posmChecks) * 100 : 0,
        plannedFreeSamples: 0,
        distributedFreeSamples: Number(counts?.distributed_free_samples ?? 0),
        remainingFreeSamples: 0,
        freeSampleAchievementRate: 0,
      },
      appliedDateWindow: dateWindow,
    });
  } catch (error) {
    captureException(error, { organizationId, route: "/api/admin/dashboard/summary" });
    return NextResponse.json({ success: false, message: "Failed to load dashboard summary." }, { status: 500 });
  }
}
