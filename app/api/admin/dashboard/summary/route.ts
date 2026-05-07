import { NextRequest, NextResponse } from "next/server";

import { getOrgMembershipForUser, hasAllowedOrgRole } from "@/lib/auth/org-access";
import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
}

type TerritoryBucket = {
  label: string;
  state: string;
  lga: string;
  visits: number;
  conversions: number;
  rate: number;
  latitude: number;
  longitude: number;
};

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
  if (campaignId && campaignId !== "all") campaignsQuery = campaignsQuery.eq("id", campaignId);

  let outletsQuery = supabase.from("outlets").select("id").eq("organization_id", organizationId);
  if (campaignId && campaignId !== "all") outletsQuery = outletsQuery.eq("campaign_id", campaignId);

  let salesQuery = supabase
    .from("sales")
    .select("id, conversion_status, sales_value, created_at, campaign_id")
    .eq("organization_id", organizationId);
  if (campaignId && campaignId !== "all") salesQuery = salesQuery.eq("campaign_id", campaignId);
  if (dateFrom) salesQuery = salesQuery.gte("created_at", `${dateFrom}T00:00:00.000Z`);
  if (dateTo) salesQuery = salesQuery.lte("created_at", `${dateTo}T23:59:59.999Z`);

  let syncedSalesQuery = supabase.from("sales").select("id").eq("organization_id", organizationId).eq("sync_status", "synced");
  if (campaignId && campaignId !== "all") syncedSalesQuery = syncedSalesQuery.eq("campaign_id", campaignId);
  if (dateFrom) syncedSalesQuery = syncedSalesQuery.gte("created_at", `${dateFrom}T00:00:00.000Z`);
  if (dateTo) syncedSalesQuery = syncedSalesQuery.lte("created_at", `${dateTo}T23:59:59.999Z`);

  let recentQuery = supabase
    .from("sales")
    .select("id, conversion_status, created_at, outlet_id, agent_id, campaign_id")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(8);
  if (campaignId && campaignId !== "all") recentQuery = recentQuery.eq("campaign_id", campaignId);
  if (dateFrom) recentQuery = recentQuery.gte("created_at", `${dateFrom}T00:00:00.000Z`);
  if (dateTo) recentQuery = recentQuery.lte("created_at", `${dateTo}T23:59:59.999Z`);

  let visitsQuery = supabase
    .from("visits")
    .select("id, created_at, campaign_id, outcome, lga, state, latitude, longitude")
    .eq("organization_id", organizationId);
  if (campaignId && campaignId !== "all") visitsQuery = visitsQuery.eq("campaign_id", campaignId);
  if (dateFrom) visitsQuery = visitsQuery.gte("created_at", `${dateFrom}T00:00:00.000Z`);
  if (dateTo) visitsQuery = visitsQuery.lte("created_at", `${dateTo}T23:59:59.999Z`);

  const [campaignsRes, repsRes, outletsRes, salesRes, syncRes, recentRes, visitsRes] = await Promise.all([
    campaignsQuery,
    supabase.from("rep_profiles").select("id, status").eq("organization_id", organizationId),
    outletsQuery,
    salesQuery,
    syncedSalesQuery,
    recentQuery,
    visitsQuery,
  ]);

  const campaigns = campaignsRes.data ?? [];
  const reps = repsRes.data ?? [];
  const outlets = outletsRes.data ?? [];
  const sales = salesRes.data ?? [];
  const syncedSales = syncRes.data ?? [];
  const recent = recentRes.data ?? [];
  const visits = visitsRes.data ?? [];

  const convertedCount = sales.filter((s) => s.conversion_status === "converted").length;
  const totalSales = sales.reduce((sum, item) => sum + Number(item.sales_value ?? 0), 0);
  const conversionRate = sales.length ? (convertedCount / sales.length) * 100 : 0;
  const syncHealth = sales.length ? (syncedSales.length / sales.length) * 100 : 100;

  const outletIds = [...new Set(recent.map((x) => x.outlet_id).filter(Boolean))] as string[];
  const repIds = [...new Set(recent.map((x) => x.agent_id).filter(Boolean))] as string[];
  const [{ data: outletNames }, { data: repNames }] = await Promise.all([
    outletIds.length
      ? supabase.from("outlets").select("id, name").in("id", outletIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    repIds.length
      ? supabase.from("profiles").select("user_id, full_name").in("user_id", repIds)
      : Promise.resolve({ data: [] as Array<{ user_id: string; full_name: string | null }> }),
  ]);
  const outletMap = new Map((outletNames ?? []).map((x) => [x.id, x.name]));
  const repMap = new Map((repNames ?? []).map((x) => [x.user_id, x.full_name ?? "Unknown"]));

  const trendBuckets = new Map<string, { day: string; visits: number; conversions: number }>();
  for (const visit of visits) {
    const key = new Date(visit.created_at).toISOString().slice(0, 10);
    const bucket = trendBuckets.get(key) ?? {
      day: new Date(visit.created_at).toLocaleDateString("en-US", { weekday: "short" }),
      visits: 0,
      conversions: 0,
    };
    bucket.visits += 1;
    if (visit.outcome === "converted") bucket.conversions += 1;
    trendBuckets.set(key, bucket);
  }
  const trend = Array.from(trendBuckets.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .slice(-7)
    .map(([, value]) => value);

  const territoryMap = new Map<string, { state: string; lga: string; visits: number; conversions: number; latSum: number; lngSum: number; geoCount: number }>();
  for (const visit of visits) {
    const state = (visit.state ?? "").trim();
    const lga = (visit.lga ?? "").trim();
    if (!state && !lga) continue;
    const key = `${state}||${lga}`;
    const existing = territoryMap.get(key) ?? {
      state: state || "Unknown State",
      lga: lga || "Unknown LGA",
      visits: 0,
      conversions: 0,
      latSum: 0,
      lngSum: 0,
      geoCount: 0,
    };
    existing.visits += 1;
    if (visit.outcome === "converted") existing.conversions += 1;
    if (typeof visit.latitude === "number" && typeof visit.longitude === "number") {
      existing.latSum += visit.latitude;
      existing.lngSum += visit.longitude;
      existing.geoCount += 1;
    }
    territoryMap.set(key, existing);
  }

  const territoryPerformance: TerritoryBucket[] = Array.from(territoryMap.values())
    .filter((bucket) => bucket.geoCount > 0)
    .map((bucket) => ({
      label: `${bucket.lga}, ${bucket.state}`,
      state: bucket.state,
      lga: bucket.lga,
      visits: bucket.visits,
      conversions: bucket.conversions,
      rate: bucket.visits ? (bucket.conversions / bucket.visits) * 100 : 0,
      latitude: bucket.latSum / bucket.geoCount,
      longitude: bucket.lngSum / bucket.geoCount,
    }))
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 50);

  return NextResponse.json({
    success: true,
    summary: {
      activeCampaigns: campaigns.filter((c) => c.status === "active").length,
      totalCampaigns: campaigns.length,
      activeReps: reps.filter((r) => r.status === "active").length,
      totalOutlets: outlets.length,
      totalSalesRecords: sales.length,
      conversions: convertedCount,
      conversionRate,
      salesValue: totalSales,
      syncHealth,
    },
    trend,
    territoryPerformance,
    recentActivity: recent.map((item) => ({
      id: item.id,
      status: item.conversion_status,
      time: item.created_at,
      outlet: item.outlet_id ? outletMap.get(item.outlet_id) ?? "-" : "-",
      rep: item.agent_id ? repMap.get(item.agent_id) ?? "-" : "-",
    })),
  });
}
