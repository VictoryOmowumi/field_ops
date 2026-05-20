import { NextRequest, NextResponse } from "next/server";

import { getOrgMembershipForUser, hasAllowedOrgRole } from "@/lib/auth/org-access";
import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { computeMetricsFromRows } from "@/lib/campaign/intelligence";
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
  const organizationId = membership.organizationId;
  const campaignId = request.nextUrl.searchParams.get("campaignId");
  const dateFrom = request.nextUrl.searchParams.get("dateFrom");
  const dateTo = request.nextUrl.searchParams.get("dateTo");

  let campaignsQuery = supabase.from("campaigns").select("id, status").eq("organization_id", organizationId);
  let salesQuery = supabase
    .from("sales")
    .select("id, created_at, campaign_id, agent_id, visit_id, outlet_id, quantity, sales_value")
    .eq("organization_id", organizationId);
  let visitsQuery = supabase
    .from("visits")
    .select("id, created_at, campaign_id, outcome, lga, state, task_payload, agent_id, outlet_id, sync_status")
    .eq("organization_id", organizationId);

  if (campaignId && campaignId !== "all") {
    campaignsQuery = campaignsQuery.eq("id", campaignId);
    salesQuery = salesQuery.eq("campaign_id", campaignId);
    visitsQuery = visitsQuery.eq("campaign_id", campaignId);
  }
  if (dateFrom) {
    salesQuery = salesQuery.gte("created_at", `${dateFrom}T00:00:00.000Z`);
    visitsQuery = visitsQuery.gte("created_at", `${dateFrom}T00:00:00.000Z`);
  }
  if (dateTo) {
    salesQuery = salesQuery.lte("created_at", `${dateTo}T23:59:59.999Z`);
    visitsQuery = visitsQuery.lte("created_at", `${dateTo}T23:59:59.999Z`);
  }

  const [campaignsRes, salesRes, visitsRes] = await Promise.all([campaignsQuery, salesQuery, visitsQuery]);
  const campaigns = campaignsRes.data ?? [];
  const sales = salesRes.data ?? [];
  const visits = visitsRes.data ?? [];

  const canonical = computeMetricsFromRows(
    visits.map((visit) => ({
      id: visit.id,
      created_at: visit.created_at,
      sync_status: visit.sync_status ?? null,
      outlet_id: visit.outlet_id ?? null,
      state: visit.state ?? null,
      lga: visit.lga ?? null,
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

  const activeRepIds = new Set<string>();
  for (const visit of visits as Array<{ agent_id?: string | null }>) if (visit.agent_id) activeRepIds.add(visit.agent_id);
  for (const sale of sales as Array<{ agent_id?: string | null }>) if (sale.agent_id) activeRepIds.add(sale.agent_id);

  return NextResponse.json({
    success: true,
    summary: {
      activeCampaigns: campaigns.filter((c) => c.status === "active").length,
      totalCampaigns: campaigns.length,
      activeReps: activeRepIds.size,
      totalOutlets: canonical.summary.achievedVisits,
      totalVisits: canonical.summary.totalSubmissions,
      totalSalesRecords: sales.length,
      conversions: canonical.summary.convertedOutlets,
      salesCount: canonical.summary.salesCount ?? 0,
      unitsSold: canonical.summary.unitsSold ?? 0,
      conversionRate: canonical.summary.conversionRate,
      salesValue: sales.reduce((sum, item) => sum + Number(item.sales_value ?? 0), 0),
      syncHealth: canonical.summary.syncHealth,
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
}
