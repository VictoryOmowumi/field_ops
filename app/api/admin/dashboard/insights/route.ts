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

function toDayLabel(isoDate: string) {
  return new Date(`${isoDate}T00:00:00.000Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    timeZone: "UTC",
  });
}

type TrendRow = { day: string; visits: number; conversions: number };
type TerritoryRow = {
  state: string;
  lga: string;
  visits: number;
  conversions: number;
  avg_latitude: number | null;
  avg_longitude: number | null;
};
type RepRow = { agent_id: string; visits: number; conversions: number };

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
  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") ?? "1"));
  const pageSize = Math.min(50, Math.max(5, Number(request.nextUrl.searchParams.get("pageSize") ?? "10")));
  const dateWindow = resolveDateWindow(
    request.nextUrl.searchParams.get("dateFrom"),
    request.nextUrl.searchParams.get("dateTo"),
    2
  );
  const dateFromIso = dateWindow.dateFrom ? `${dateWindow.dateFrom}T00:00:00.000Z` : null;
  const dateToIso = dateWindow.dateTo ? `${dateWindow.dateTo}T23:59:59.999Z` : null;

  try {
    const [trendRes, territoryRes, repRes] = await Promise.all([
      supabase.rpc("dashboard_trend", {
        p_organization_id: organizationId,
        p_campaign_id: campaignId,
        p_date_from: dateFromIso,
        p_date_to: dateToIso,
      }),
      supabase.rpc("dashboard_territory_performance", {
        p_organization_id: organizationId,
        p_campaign_id: campaignId,
        p_date_from: dateFromIso,
        p_date_to: dateToIso,
      }),
      supabase.rpc("dashboard_rep_performance", {
        p_organization_id: organizationId,
        p_campaign_id: campaignId,
        p_date_from: dateFromIso,
        p_date_to: dateToIso,
        p_limit: 5,
      }),
    ]);
    if (trendRes.error) throw new Error(`Failed to load activation trend: ${trendRes.error.message}`);
    if (territoryRes.error) throw new Error(`Failed to load territory performance: ${territoryRes.error.message}`);
    if (repRes.error) throw new Error(`Failed to load rep performance: ${repRes.error.message}`);

    const trend = ((trendRes.data ?? []) as Array<{ day: string; visits: number; conversions: number }>)
      .map((row): TrendRow => ({ day: toDayLabel(row.day), visits: Number(row.visits), conversions: Number(row.conversions) }))
      .slice(-7);

    const territoryPerformance = ((territoryRes.data ?? []) as TerritoryRow[]).map((row) => ({
      label: `${row.lga}, ${row.state}`,
      state: row.state,
      lga: row.lga,
      visits: Number(row.visits),
      conversions: Number(row.conversions),
      rate: Number(row.visits) > 0 ? (Number(row.conversions) / Number(row.visits)) * 100 : 0,
      latitude: row.avg_latitude ?? 0,
      longitude: row.avg_longitude ?? 0,
    }));

    const topRepRows = (repRes.data ?? []) as RepRow[];
    const topRepIds = topRepRows.map((row) => row.agent_id);

    const start = (page - 1) * pageSize;
    let recentQuery = supabase
      .from("visits")
      .select("id, created_at, campaign_id, outlet_id, agent_id, outcome", { count: "exact" })
      .eq("organization_id", organizationId);
    if (campaignId) recentQuery = recentQuery.eq("campaign_id", campaignId);
    if (dateFromIso) recentQuery = recentQuery.gte("created_at", dateFromIso);
    if (dateToIso) recentQuery = recentQuery.lte("created_at", dateToIso);
    const { data: recentRows, count: total, error: recentError } = await recentQuery
      .order("created_at", { ascending: false })
      .range(start, start + pageSize - 1);
    if (recentError) throw new Error(`Failed to load recent activity: ${recentError.message}`);

    const recentAgentIds = [...new Set((recentRows ?? []).map((x) => x.agent_id).filter(Boolean))] as string[];
    const outletIds = [...new Set((recentRows ?? []).map((x) => x.outlet_id).filter(Boolean))] as string[];
    const repIdsForNames = [...new Set([...recentAgentIds, ...topRepIds])];

    const [{ data: outletNames }, { data: repNames }] = await Promise.all([
      outletIds.length
        ? supabase.from("outlets").select("id, name").in("id", outletIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
      repIdsForNames.length
        ? supabase.from("profiles").select("user_id, full_name").in("user_id", repIdsForNames)
        : Promise.resolve({ data: [] as Array<{ user_id: string; full_name: string | null }> }),
    ]);
    const outletMap = new Map((outletNames ?? []).map((x) => [x.id, x.name]));
    const repMap = new Map((repNames ?? []).map((x) => [x.user_id, x.full_name ?? "Unknown"]));

    const repPerformance = topRepRows.map((row, index) => ({
      rank: index + 1,
      repId: row.agent_id,
      name: repMap.get(row.agent_id) ?? "Unknown",
      visits: Number(row.visits),
      conversions: Number(row.conversions),
    }));

    const totalCount = total ?? 0;

    return NextResponse.json({
      success: true,
      trend,
      territoryPerformance,
      repPerformance,
      recentActivity: (recentRows ?? []).map((item) => ({
        id: item.id,
        campaignId: item.campaign_id ?? null,
        status: item.outcome ?? "submitted",
        time: item.created_at,
        outlet: item.outlet_id ? outletMap.get(item.outlet_id) ?? "-" : "-",
        rep: item.agent_id ? repMap.get(item.agent_id) ?? "-" : "-",
      })),
      pagination: { page, pageSize, total: totalCount, hasMore: page * pageSize < totalCount },
      appliedDateWindow: dateWindow,
    });
  } catch (error) {
    captureException(error, { organizationId, route: "/api/admin/dashboard/insights" });
    return NextResponse.json({ success: false, message: "Failed to load dashboard insights." }, { status: 500 });
  }
}
