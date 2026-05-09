import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  CampaignActivityRow,
  CampaignAnalyticsSummary,
  CampaignEvidenceItem,
  CampaignMapPoint,
} from "@/types/campaign-intelligence";

type ActivityFilters = {
  page?: number;
  pageSize?: number;
  dateFrom?: string | null;
  dateTo?: string | null;
  status?: string | null;
  search?: string | null;
};

export async function getCampaignAnalyticsSummary(
  supabase: SupabaseClient,
  organizationId: string,
  campaignId: string
): Promise<CampaignAnalyticsSummary> {
  const [{ data: visits }, { data: sales }] = await Promise.all([
    supabase
      .from("visits")
      .select("id, created_at, outcome, sync_status, outlet_id, state, lga, task_payload")
      .eq("organization_id", organizationId)
      .eq("campaign_id", campaignId),
    supabase
      .from("sales")
      .select("id, created_at, conversion_status")
      .eq("organization_id", organizationId)
      .eq("campaign_id", campaignId),
  ]);

  const visitRows = visits ?? [];
  const saleRows = sales ?? [];
  const totalSubmissions = visitRows.length + saleRows.length;
  const uniqueOutlets = new Set(visitRows.map((item) => item.outlet_id).filter(Boolean)).size;
  const areasCovered = new Set(
    visitRows.map((item) => `${item.state ?? ""}|${item.lga ?? ""}`).filter((key) => key !== "|")
  ).size;
  const converted = visitRows.filter((item) => item.outcome === "converted").length;
  const conversionRate = visitRows.length > 0 ? (converted / visitRows.length) * 100 : 0;
  const syncedVisits = visitRows.filter((item) => item.sync_status === "synced").length;
  const syncHealth = visitRows.length > 0 ? (syncedVisits / visitRows.length) * 100 : 100;
  let posmChecks = 0;
  let posmDeployed = 0;
  let posmUnits = 0;
  for (const visit of visitRows) {
    const payload = (visit.task_payload ?? {}) as { activities?: Array<{ activityId?: string; payload?: Record<string, unknown> }> };
    const posm = payload.activities?.find((item) => item.activityId === "posm_deployment");
    if (!posm) continue;
    posmChecks += 1;
    const deployed = Boolean(posm.payload?.deployed);
    if (deployed) {
      posmDeployed += 1;
      const qty = Number(posm.payload?.quantity ?? 0);
      if (Number.isFinite(qty) && qty > 0) posmUnits += qty;
    }
  }
  const posmDeploymentRate = posmChecks > 0 ? (posmDeployed / posmChecks) * 100 : 0;

  const trendMap = new Map<string, { day: string; submissions: number; conversions: number }>();
  for (const row of visitRows) {
    const key = new Date(row.created_at).toISOString().slice(0, 10);
    const bucket = trendMap.get(key) ?? {
      day: new Date(row.created_at).toLocaleDateString("en-US", { month: "short", day: "2-digit" }),
      submissions: 0,
      conversions: 0,
    };
    bucket.submissions += 1;
    if (row.outcome === "converted") bucket.conversions += 1;
    trendMap.set(key, bucket);
  }
  const recentTrend = Array.from(trendMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-14)
    .map(([, value]) => value);

  return {
    totalSubmissions,
    uniqueOutlets,
    areasCovered,
    conversionRate,
    syncHealth,
    posmChecks,
    posmDeployed,
    posmUnits,
    posmDeploymentRate,
    recentTrend,
  };
}

export async function getCampaignMapPoints(
  supabase: SupabaseClient,
  organizationId: string,
  campaignId: string
): Promise<CampaignMapPoint[]> {
  const [{ data: visits }, { data: sales }] = await Promise.all([
    supabase
      .from("visits")
      .select("id, created_at, outcome, sync_status, outlet_id, agent_id, latitude, longitude, lga")
      .eq("organization_id", organizationId)
      .eq("campaign_id", campaignId)
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .limit(2000),
    supabase
      .from("sales")
      .select("id, created_at, conversion_status, sync_status, outlet_id, agent_id, latitude, longitude")
      .eq("organization_id", organizationId)
      .eq("campaign_id", campaignId)
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .limit(2000),
  ]);

  const outletIds = [
    ...new Set([...(visits ?? []).map((x) => x.outlet_id), ...(sales ?? []).map((x) => x.outlet_id)].filter(Boolean)),
  ] as string[];
  const userIds = [
    ...new Set([...(visits ?? []).map((x) => x.agent_id), ...(sales ?? []).map((x) => x.agent_id)].filter(Boolean)),
  ] as string[];

  const [{ data: outlets }, { data: profiles }] = await Promise.all([
    outletIds.length ? supabase.from("outlets").select("id, name").in("id", outletIds) : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    userIds.length ? supabase.from("profiles").select("user_id, full_name").in("user_id", userIds) : Promise.resolve({ data: [] as Array<{ user_id: string; full_name: string | null }> }),
  ]);

  const outletMap = new Map((outlets ?? []).map((x) => [x.id, x.name]));
  const profileMap = new Map((profiles ?? []).map((x) => [x.user_id, x.full_name ?? "Unknown"]));

  return [
    ...(visits ?? []).map((row) => ({
      id: `visit-${row.id}`,
      source: "visit" as const,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      outlet: row.outlet_id ? outletMap.get(row.outlet_id) ?? "-" : "-",
      lga: row.lga ?? null,
      agent: row.agent_id ? profileMap.get(row.agent_id) ?? "-" : "-",
      status: row.outcome ?? "-",
      syncStatus: row.sync_status ?? "-",
      createdAt: row.created_at,
    })),
    ...(sales ?? []).map((row) => ({
      id: `sale-${row.id}`,
      source: "sale" as const,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      outlet: row.outlet_id ? outletMap.get(row.outlet_id) ?? "-" : "-",
      lga: null,
      agent: row.agent_id ? profileMap.get(row.agent_id) ?? "-" : "-",
      status: row.conversion_status ?? "-",
      syncStatus: row.sync_status ?? "-",
      createdAt: row.created_at,
    })),
  ];
}

export async function getCampaignActivities(
  supabase: SupabaseClient,
  organizationId: string,
  campaignId: string,
  filters: ActivityFilters
): Promise<{ rows: CampaignActivityRow[]; total: number }> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(200, Math.max(10, filters.pageSize ?? 50));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let visitsQuery = supabase
    .from("visits")
    .select("id, outcome, task_type, task_payload, lga, latitude, longitude, created_at, outlet_id, agent_id", { count: "exact" })
    .eq("organization_id", organizationId)
    .eq("campaign_id", campaignId);
  if (filters.dateFrom) visitsQuery = visitsQuery.gte("created_at", `${filters.dateFrom}T00:00:00.000Z`);
  if (filters.dateTo) visitsQuery = visitsQuery.lte("created_at", `${filters.dateTo}T23:59:59.999Z`);
  if (filters.status && filters.status !== "all") visitsQuery = visitsQuery.eq("outcome", filters.status);
  const { data: visits, count } = await visitsQuery.order("created_at", { ascending: false }).range(from, to);

  const visitRows = visits ?? [];
  const visitIds = visitRows.map((item) => item.id);
  const outletIds = [...new Set(visitRows.map((item) => item.outlet_id).filter(Boolean))] as string[];
  const userIds = [...new Set(visitRows.map((item) => item.agent_id).filter(Boolean))] as string[];

  const [{ data: salesRows }, { data: outlets }, { data: profiles }] = await Promise.all([
    visitIds.length
      ? supabase
          .from("sales")
          .select("id, visit_id, product_name, quantity, conversion_status")
          .eq("organization_id", organizationId)
          .in("visit_id", visitIds)
      : Promise.resolve({ data: [] as Array<{ id: string; visit_id: string; product_name: string | null; quantity: number | null; conversion_status: string | null }> }),
    outletIds.length ? supabase.from("outlets").select("id, name, contact_person, lga").in("id", outletIds) : Promise.resolve({ data: [] as Array<{ id: string; name: string; contact_person: string | null; lga: string | null }> }),
    userIds.length ? supabase.from("profiles").select("user_id, full_name").in("user_id", userIds) : Promise.resolve({ data: [] as Array<{ user_id: string; full_name: string | null }> }),
  ]);

  const saleByVisit = new Map<string, Array<{ id: string; product_name: string | null; quantity: number | null; conversion_status: string | null }>>();
  for (const item of salesRows ?? []) {
    const list = saleByVisit.get(item.visit_id) ?? [];
    list.push({
      id: item.id,
      product_name: item.product_name ?? null,
      quantity: item.quantity ?? null,
      conversion_status: item.conversion_status ?? null,
    });
    saleByVisit.set(item.visit_id, list);
  }
  const outletMap = new Map((outlets ?? []).map((x) => [x.id, x]));
  const profileMap = new Map((profiles ?? []).map((x) => [x.user_id, x.full_name ?? "Unknown"]));

  let rows: CampaignActivityRow[] = visitRows.map((row) => {
    const saleLines = saleByVisit.get(row.id) ?? [];
    const outlet = row.outlet_id ? outletMap.get(row.outlet_id) : null;
    const taskPayload = (row.task_payload ?? {}) as { activities?: Array<{ activityId?: string; payload?: Record<string, unknown> }> };
    const activityProducts = (taskPayload.activities ?? [])
      .map((item) => item.payload?.productName ?? item.payload?.product ?? null)
      .filter(Boolean)
      .map((item) => String(item));
    const saleProducts = saleLines.map((line) => line.product_name).filter(Boolean).map((item) => String(item));
    const products = [...new Set([...saleProducts, ...activityProducts])];
    const coords =
      typeof row.latitude === "number" && typeof row.longitude === "number"
        ? `${row.latitude.toFixed(5)}, ${row.longitude.toFixed(5)}`
        : "-";
    return {
      id: `visit-${row.id}`,
      type: "visit",
      taskType: row.task_type ?? "visit",
      status: row.outcome ?? "-",
      createdAt: row.created_at,
      customer: outlet?.contact_person ?? "-",
      outlet: outlet?.name ?? "-",
      area: row.lga ?? outlet?.lga ?? "-",
      products: products.length > 0 ? products.join(", ") : "-",
      location: coords,
      actor: row.agent_id ? profileMap.get(row.agent_id) ?? "-" : "-",
      taskPayload: (row.task_payload as Record<string, unknown> | null) ?? null,
      saleCount: saleLines.length,
      saleLines,
    };
  });

  if (filters.search) {
    const q = filters.search.toLowerCase();
    rows = rows.filter((row) =>
      row.outlet.toLowerCase().includes(q)
      || (row.customer ?? "").toLowerCase().includes(q)
      || (row.area ?? "").toLowerCase().includes(q)
      || (row.products ?? "").toLowerCase().includes(q)
      || (row.location ?? "").toLowerCase().includes(q)
      || row.actor.toLowerCase().includes(q)
      || row.status.toLowerCase().includes(q)
    );
  }

  return { rows, total: count ?? rows.length };
}

export async function getCampaignEvidence(
  supabase: SupabaseClient,
  organizationId: string,
  campaignId: string
): Promise<CampaignEvidenceItem[]> {
  const { data: evidenceRows } = await supabase
    .from("visit_evidence")
    .select("id, visit_id, file_url, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(300);

  const filtered = (evidenceRows ?? []).filter((row) => Boolean(row.visit_id));
  const visitIds = [...new Set(filtered.map((row) => row.visit_id))] as string[];
  const { data: visits } = visitIds.length
    ? await supabase
      .from("visits")
      .select("id, campaign_id, outlet_id, agent_id")
      .eq("organization_id", organizationId)
      .eq("campaign_id", campaignId)
      .in("id", visitIds)
    : { data: [] as Array<{ id: string; campaign_id: string; outlet_id: string | null; agent_id: string | null }> };

  const visitMap = new Map((visits ?? []).map((item) => [item.id, item]));
  const scopedEvidence = filtered.filter((row) => visitMap.has(row.visit_id));

  const outletIds = [...new Set((visits ?? []).map((item) => item.outlet_id).filter(Boolean))] as string[];
  const userIds = [...new Set((visits ?? []).map((item) => item.agent_id).filter(Boolean))] as string[];
  const [{ data: outlets }, { data: profiles }] = await Promise.all([
    outletIds.length ? supabase.from("outlets").select("id, name").in("id", outletIds) : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    userIds.length ? supabase.from("profiles").select("user_id, full_name").in("user_id", userIds) : Promise.resolve({ data: [] as Array<{ user_id: string; full_name: string | null }> }),
  ]);

  const signed = scopedEvidence.length > 0
    ? await supabase.storage.from("evidence").createSignedUrls(scopedEvidence.map((row) => row.file_url), 60 * 60)
    : { data: [] as Array<{ path: string; signedUrl: string }> };
  const signedMap = new Map((signed.data ?? []).map((row) => [row.path, row.signedUrl]));
  const outletMap = new Map((outlets ?? []).map((item) => [item.id, item.name]));
  const profileMap = new Map((profiles ?? []).map((item) => [item.user_id, item.full_name ?? "Unknown"]));

  return scopedEvidence.map((row) => {
    const visit = visitMap.get(row.visit_id);
    return {
      id: row.id,
      visit_id: row.visit_id,
      created_at: row.created_at,
      file_url: row.file_url,
      signed_url: signedMap.get(row.file_url) ?? null,
      outlet: visit?.outlet_id ? outletMap.get(visit.outlet_id) ?? "-" : "-",
      actor: visit?.agent_id ? profileMap.get(visit.agent_id) ?? "-" : "-",
    };
  });
}
