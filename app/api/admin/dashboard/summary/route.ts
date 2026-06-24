import { NextRequest, NextResponse } from "next/server";

import { getOrgMembershipForUser, hasAllowedOrgRole } from "@/lib/auth/org-access";
import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { computeMetricsFromRows } from "@/lib/campaign/intelligence";
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
  const campaignId = request.nextUrl.searchParams.get("campaignId");
  const dateFrom = request.nextUrl.searchParams.get("dateFrom");
  const dateTo = request.nextUrl.searchParams.get("dateTo");

  let campaignsQuery = supabase.from("campaigns").select("id, status").eq("organization_id", organizationId);
  let salesQuery = supabase
    .from("sales")
    .select("id, created_at, campaign_id, agent_id, visit_id, outlet_id, quantity, sales_value")
    .eq("organization_id", organizationId);
  // Lighter than the old unbounded select: drops outlet_id/state/lga/outcome since those
  // counts now come from the visit_metrics_summary RPC, which runs entirely in Postgres
  // instead of transferring every visit row (the actual cause of the statement timeouts).
  let activityQuery = supabase
    .from("visits")
    .select("id, created_at, campaign_id, agent_id, task_payload")
    .eq("organization_id", organizationId);

  if (campaignId && campaignId !== "all") {
    campaignsQuery = campaignsQuery.eq("id", campaignId);
    salesQuery = salesQuery.eq("campaign_id", campaignId);
    activityQuery = activityQuery.eq("campaign_id", campaignId);
  }
  if (dateFrom) {
    salesQuery = salesQuery.gte("created_at", `${dateFrom}T00:00:00.000Z`);
    activityQuery = activityQuery.gte("created_at", `${dateFrom}T00:00:00.000Z`);
  }
  if (dateTo) {
    salesQuery = salesQuery.lte("created_at", `${dateTo}T23:59:59.999Z`);
    activityQuery = activityQuery.lte("created_at", `${dateTo}T23:59:59.999Z`);
  }

  try {
    const [campaignsRes, salesRes, activityRes, countsRes] = await withPerformanceTracking(
      "query",
      "admin_dashboard_summary",
      () =>
        Promise.all([
          campaignsQuery,
          salesQuery,
          activityQuery,
          supabase
            .rpc("visit_metrics_summary", {
              p_organization_id: organizationId,
              p_campaign_id: campaignId && campaignId !== "all" ? campaignId : null,
              p_date_from: dateFrom ? `${dateFrom}T00:00:00.000Z` : null,
              p_date_to: dateTo ? `${dateTo}T23:59:59.999Z` : null,
            })
            .single(),
        ]),
      organizationId
    );

    if (campaignsRes.error) throw new Error(`Failed to load campaigns: ${campaignsRes.error.message}`);
    if (salesRes.error) throw new Error(`Failed to load sales: ${salesRes.error.message}`);
    if (activityRes.error) throw new Error(`Failed to load visit activity: ${activityRes.error.message}`);
    if (countsRes.error) throw new Error(`Failed to load visit metrics: ${countsRes.error.message}`);

    const campaigns = campaignsRes.data ?? [];
    const sales = salesRes.data ?? [];
    const activityRows = activityRes.data ?? [];
    const counts = countsRes.data as {
      total_visits: number;
      unique_outlets: number;
      unique_areas: number;
      synced_visits: number;
    } | null;

    const canonical = computeMetricsFromRows(
      activityRows.map((visit) => ({
        id: visit.id,
        created_at: visit.created_at,
        sync_status: null,
        outlet_id: null,
        state: null,
        lga: null,
        task_payload: visit.task_payload ?? null,
      })),
      sales.map((sale) => ({
        id: sale.id,
        visit_id: sale.visit_id ?? null,
        outlet_id: sale.outlet_id ?? null,
        created_at: sale.created_at,
        quantity: sale.quantity ?? null,
        sales_value: sale.sales_value ?? null,
      })),
      `dashboard-summary:${organizationId}:${campaignId ?? "all"}:${dateFrom ?? "-"}:${dateTo ?? "-"}`
    );

    const totalVisits = Number(counts?.total_visits ?? 0);
    const uniqueOutlets = Number(counts?.unique_outlets ?? 0);

    const activeRepIds = new Set<string>();
    for (const visit of activityRows) if (visit.agent_id) activeRepIds.add(visit.agent_id);
    for (const sale of sales as Array<{ agent_id?: string | null }>) if (sale.agent_id) activeRepIds.add(sale.agent_id);

    return NextResponse.json({
      success: true,
      summary: {
        activeCampaigns: campaigns.filter((c) => c.status === "active").length,
        totalCampaigns: campaigns.length,
        activeReps: activeRepIds.size,
        totalOutlets: uniqueOutlets,
        totalVisits,
        totalSalesRecords: sales.length,
        conversions: canonical.summary.convertedOutlets,
        salesCount: canonical.summary.salesCount ?? 0,
        unitsSold: canonical.summary.unitsSold ?? 0,
        conversionRate: uniqueOutlets > 0 ? (canonical.summary.convertedOutlets / uniqueOutlets) * 100 : 0,
        salesValue: sales.reduce((sum, item) => sum + Number(item.sales_value ?? 0), 0),
        syncHealth: totalVisits > 0 ? (Number(counts?.synced_visits ?? 0) / totalVisits) * 100 : 100,
        posmChecks: canonical.summary.posmChecks,
        posmDeployed: canonical.summary.posmDeployed,
        posmUnits: canonical.summary.posmUnits,
        posmDeploymentRate: canonical.summary.posmDeploymentRate,
        plannedFreeSamples: canonical.summary.plannedFreeSamples ?? 0,
        distributedFreeSamples: canonical.summary.distributedFreeSamples ?? 0,
        remainingFreeSamples: canonical.summary.remainingFreeSamples ?? 0,
        freeSampleAchievementRate: canonical.summary.freeSampleAchievementRate ?? 0,
      },
    });
  } catch (error) {
    captureException(error, { organizationId, route: "/api/admin/dashboard/summary" });
    return NextResponse.json({ success: false, message: "Failed to load dashboard summary." }, { status: 500 });
  }
}
