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

function toIsoDay(date: Date) {
  return date.toISOString().slice(0, 10);
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
  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") ?? "1"));
  const pageSize = Math.min(50, Math.max(5, Number(request.nextUrl.searchParams.get("pageSize") ?? "10")));
  const dateWindow = resolveDateWindow(
    request.nextUrl.searchParams.get("dateFrom"),
    request.nextUrl.searchParams.get("dateTo"),
    2
  );

  let visitsQuery = supabase
    .from("visits")
    .select("id, created_at, outcome, lga, state, latitude, longitude, outlet_id, agent_id, campaign_id")
    .eq("organization_id", organizationId);
  let salesQuery = supabase
    .from("sales")
    .select("visit_id, quantity, sales_value")
    .eq("organization_id", organizationId);

  if (campaignId && campaignId !== "all") {
    visitsQuery = visitsQuery.eq("campaign_id", campaignId);
    salesQuery = salesQuery.eq("campaign_id", campaignId);
  }
  if (dateWindow.dateFrom) {
    visitsQuery = visitsQuery.gte("created_at", `${dateWindow.dateFrom}T00:00:00.000Z`);
    salesQuery = salesQuery.gte("created_at", `${dateWindow.dateFrom}T00:00:00.000Z`);
  }
  if (dateWindow.dateTo) {
    visitsQuery = visitsQuery.lte("created_at", `${dateWindow.dateTo}T23:59:59.999Z`);
    salesQuery = salesQuery.lte("created_at", `${dateWindow.dateTo}T23:59:59.999Z`);
  }

  const [{ data: visits }, { data: sales }] = await Promise.all([visitsQuery, salesQuery]);
  const visitRows = visits ?? [];
  const saleRows = sales ?? [];
  const convertedVisitIds = new Set(
    saleRows
      .filter((sale) => Number(sale.quantity ?? 0) > 0 || Number(sale.sales_value ?? 0) > 0)
      .map((sale) => sale.visit_id)
      .filter(Boolean)
  );

  const trendBuckets = new Map<string, { day: string; visits: number; conversions: number }>();
  for (const visit of visitRows) {
    const key = toIsoDay(new Date(visit.created_at));
    const bucket = trendBuckets.get(key) ?? { day: key, visits: 0, conversions: 0 };
    bucket.visits += 1;
    if (convertedVisitIds.has(visit.id)) bucket.conversions += 1;
    trendBuckets.set(key, bucket);
  }
  const trend = [...trendBuckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-7)
    .map(([, value]) => value);

  const territoryMap = new Map<string, { label: string; state: string; lga: string; visits: number; conversions: number; lat: number; lng: number; geoCount: number }>();
  for (const visit of visitRows) {
    if (typeof visit.latitude !== "number" || typeof visit.longitude !== "number") continue;
    const state = (visit.state ?? "").trim() || "Unknown State";
    const lga = (visit.lga ?? "").trim() || "Unknown LGA";
    const key = `${state}|${lga}`;
    const item = territoryMap.get(key) ?? {
      label: `${lga}, ${state}`,
      state,
      lga,
      visits: 0,
      conversions: 0,
      lat: 0,
      lng: 0,
      geoCount: 0,
    };
    item.visits += 1;
    if (convertedVisitIds.has(visit.id)) item.conversions += 1;
    item.lat += visit.latitude;
    item.lng += visit.longitude;
    item.geoCount += 1;
    territoryMap.set(key, item);
  }
  const territoryPerformance = [...territoryMap.values()]
    .map((item) => ({
      label: item.label,
      state: item.state,
      lga: item.lga,
      visits: item.visits,
      conversions: item.conversions,
      rate: item.visits > 0 ? (item.conversions / item.visits) * 100 : 0,
      latitude: item.lat / item.geoCount,
      longitude: item.lng / item.geoCount,
    }))
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 100);

  const recentSorted = [...visitRows].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const total = recentSorted.length;
  const start = (page - 1) * pageSize;
  const paged = recentSorted.slice(start, start + pageSize);
  const outletIds = [...new Set(paged.map((x) => x.outlet_id).filter(Boolean))] as string[];
  const repIds = [...new Set(paged.map((x) => x.agent_id).filter(Boolean))] as string[];
  const [{ data: outletNames }, { data: repNames }] = await Promise.all([
    outletIds.length ? supabase.from("outlets").select("id, name").in("id", outletIds) : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    repIds.length ? supabase.from("profiles").select("user_id, full_name").in("user_id", repIds) : Promise.resolve({ data: [] as Array<{ user_id: string; full_name: string | null }> }),
  ]);
  const outletMap = new Map((outletNames ?? []).map((x) => [x.id, x.name]));
  const repMap = new Map((repNames ?? []).map((x) => [x.user_id, x.full_name ?? "Unknown"]));

  return NextResponse.json({
    success: true,
    trend,
    territoryPerformance,
    recentActivity: paged.map((item) => ({
      id: item.id,
      campaignId: item.campaign_id ?? null,
      status: item.outcome ?? "submitted",
      time: item.created_at,
      outlet: item.outlet_id ? outletMap.get(item.outlet_id) ?? "-" : "-",
      rep: item.agent_id ? repMap.get(item.agent_id) ?? "-" : "-",
    })),
    pagination: { page, pageSize, total, hasMore: page * pageSize < total },
    appliedDateWindow: dateWindow,
  });
}
