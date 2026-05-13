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

type MetricsVisitRow = {
  id: string;
  created_at: string;
  sync_status?: string | null;
  outlet_id?: string | null;
  state?: string | null;
  lga?: string | null;
  task_payload?: unknown;
};

type MetricsSaleRow = {
  id: string;
  visit_id?: string | null;
  outlet_id?: string | null;
  created_at: string;
  quantity?: number | null;
  sales_value?: number | null;
};

type MetricsDiagnostics = {
  totalVisits: number;
  qualifyingSalesRows: number;
  convertedVisitIds: string[];
  convertedOutletIds: string[];
  posmChecks: number;
  posmDeployed: number;
  posmUnits: number;
};

const METRICS_DEBUG_ENABLED = process.env.METRICS_DEBUG === "1";

export function isQualifyingSaleForConversion(sale: Pick<MetricsSaleRow, "quantity" | "sales_value">) {
  return Number(sale.quantity ?? 0) > 0 || Number(sale.sales_value ?? 0) > 0;
}

export function extractPosmFromVisits(visits: MetricsVisitRow[]) {
  let posmChecks = 0;
  let posmDeployed = 0;
  let posmUnits = 0;
  for (const visit of visits) {
    const payload = (visit.task_payload ?? {}) as {
      activities?: Array<{ activityId?: string; payload?: Record<string, unknown> }>;
    };
    const posm = payload.activities?.find((item) => item.activityId === "posm_deployment");
    if (!posm) continue;
    posmChecks += 1;
    const deployed = Boolean(posm.payload?.deployed);
    if (deployed) {
      posmDeployed += 1;
      const quantity = Number(posm.payload?.quantity ?? 0);
      if (Number.isFinite(quantity) && quantity > 0) posmUnits += quantity;
    }
  }
  return {
    posmChecks,
    posmDeployed,
    posmUnits,
    posmDeploymentRate: posmChecks > 0 ? (posmDeployed / posmChecks) * 100 : 0,
  };
}

export function computeMetricsFromRows(
  visits: MetricsVisitRow[],
  sales: MetricsSaleRow[],
  debugLabel?: string
): { summary: CampaignAnalyticsSummary; convertedVisitIds: Set<string>; diagnostics: MetricsDiagnostics } {
  const totalSubmissions = visits.length;
  const uniqueOutlets = new Set(visits.map((item) => item.outlet_id).filter(Boolean)).size;
  const achievedVisits = uniqueOutlets;
  const areasCovered = new Set(
    visits.map((item) => `${item.state ?? ""}|${item.lga ?? ""}`).filter((key) => key !== "|")
  ).size;

  const convertedVisitIds = new Set<string>();
  const convertedOutletIds = new Set<string>();
  let qualifyingSalesRows = 0;
  for (const sale of sales) {
    if (!isQualifyingSaleForConversion(sale)) continue;
    qualifyingSalesRows += 1;
    if (sale.visit_id) convertedVisitIds.add(sale.visit_id);
    if (sale.outlet_id) convertedOutletIds.add(sale.outlet_id);
  }
  const conversions = convertedVisitIds.size;
  const convertedOutlets = convertedOutletIds.size;
  const conversionRate = achievedVisits > 0 ? (convertedOutlets / achievedVisits) * 100 : 0;

  const syncedVisits = visits.filter((item) => item.sync_status === "synced").length;
  const syncHealth = totalSubmissions > 0 ? (syncedVisits / totalSubmissions) * 100 : 100;

  const posm = extractPosmFromVisits(visits);

  const trendMap = new Map<string, { day: string; submissions: number; conversions: number }>();
  for (const row of visits) {
    const key = new Date(row.created_at).toISOString().slice(0, 10);
    const bucket = trendMap.get(key) ?? {
      day: new Date(row.created_at).toLocaleDateString("en-US", { month: "short", day: "2-digit" }),
      submissions: 0,
      conversions: 0,
    };
    bucket.submissions += 1;
    if (convertedVisitIds.has(row.id)) bucket.conversions += 1;
    trendMap.set(key, bucket);
  }
  const recentTrend = Array.from(trendMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-14)
    .map(([, value]) => value);

  const summary: CampaignAnalyticsSummary = {
    totalSubmissions,
    conversions,
    convertedOutlets,
    achievedVisits,
    uniqueOutlets,
    areasCovered,
    conversionRate,
    syncHealth,
    posmChecks: posm.posmChecks,
    posmDeployed: posm.posmDeployed,
    posmUnits: posm.posmUnits,
    posmDeploymentRate: posm.posmDeploymentRate,
    recentTrend,
  };

  const diagnostics: MetricsDiagnostics = {
    totalVisits: totalSubmissions,
    qualifyingSalesRows,
    convertedVisitIds: [...convertedVisitIds],
    convertedOutletIds: [...convertedOutletIds],
    posmChecks: posm.posmChecks,
    posmDeployed: posm.posmDeployed,
    posmUnits: posm.posmUnits,
  };

  if (METRICS_DEBUG_ENABLED && debugLabel) {
    console.info(`[metrics-debug:${debugLabel}]`, diagnostics);
  }

  return { summary, convertedVisitIds, diagnostics };
}

export async function getCampaignAnalyticsSummary(
  supabase: SupabaseClient,
  organizationId: string,
  campaignId: string,
  filters?: { dateFrom?: string | null; dateTo?: string | null }
): Promise<CampaignAnalyticsSummary> {
  let visitsQuery = supabase
      .from("visits")
      .select("id, created_at, outcome, sync_status, outlet_id, state, lga, task_payload")
      .eq("organization_id", organizationId)
      .eq("campaign_id", campaignId);
  let salesQuery = supabase
      .from("sales")
      .select("id, created_at, visit_id, outlet_id, quantity, sales_value")
      .eq("organization_id", organizationId)
      .eq("campaign_id", campaignId);
  if (filters?.dateFrom) {
    visitsQuery = visitsQuery.gte("created_at", `${filters.dateFrom}T00:00:00.000Z`);
    salesQuery = salesQuery.gte("created_at", `${filters.dateFrom}T00:00:00.000Z`);
  }
  if (filters?.dateTo) {
    visitsQuery = visitsQuery.lte("created_at", `${filters.dateTo}T23:59:59.999Z`);
    salesQuery = salesQuery.lte("created_at", `${filters.dateTo}T23:59:59.999Z`);
  }
  const [{ data: visits }, { data: sales }] = await Promise.all([visitsQuery, salesQuery]);
  return computeMetricsFromRows(
    (visits ?? []) as MetricsVisitRow[],
    (sales ?? []) as MetricsSaleRow[],
    `campaign:${campaignId}`
  ).summary;
}

export async function getCampaignMetricsDiagnostics(
  supabase: SupabaseClient,
  organizationId: string,
  campaignId: string
): Promise<MetricsDiagnostics> {
  const [{ data: visits }, { data: sales }] = await Promise.all([
    supabase
      .from("visits")
      .select("id, created_at, sync_status, outlet_id, state, lga, task_payload")
      .eq("organization_id", organizationId)
      .eq("campaign_id", campaignId),
    supabase
      .from("sales")
      .select("id, created_at, visit_id, outlet_id, quantity, sales_value")
      .eq("organization_id", organizationId)
      .eq("campaign_id", campaignId),
  ]);
  return computeMetricsFromRows(
    (visits ?? []) as MetricsVisitRow[],
    (sales ?? []) as MetricsSaleRow[],
    `campaign-diagnostics:${campaignId}`
  ).diagnostics;
}

export async function getCampaignMapPoints(
  supabase: SupabaseClient,
  organizationId: string,
  campaignId: string,
  options?: { source?: "visits_only" | "visits_and_sales"; dateFrom?: string | null; dateTo?: string | null }
): Promise<CampaignMapPoint[]> {
  const source = options?.source ?? "visits_and_sales";
  let visitsQuery = supabase
      .from("visits")
      .select("id, created_at, outcome, sync_status, outlet_id, agent_id, latitude, longitude, lga")
      .eq("organization_id", organizationId)
      .eq("campaign_id", campaignId)
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .limit(2000);
  if (options?.dateFrom) visitsQuery = visitsQuery.gte("created_at", `${options.dateFrom}T00:00:00.000Z`);
  if (options?.dateTo) visitsQuery = visitsQuery.lte("created_at", `${options.dateTo}T23:59:59.999Z`);
  let salesQuery = supabase
      .from("sales")
      .select("id, created_at, conversion_status, sync_status, outlet_id, agent_id, latitude, longitude, visit_id, quantity")
      .eq("organization_id", organizationId)
      .eq("campaign_id", campaignId)
      .limit(2000);
  if (options?.dateFrom) salesQuery = salesQuery.gte("created_at", `${options.dateFrom}T00:00:00.000Z`);
  if (options?.dateTo) salesQuery = salesQuery.lte("created_at", `${options.dateTo}T23:59:59.999Z`);
  const [{ data: visits }, { data: sales }] = await Promise.all([visitsQuery, salesQuery]);

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
  const saleStatsByVisit = new Map<string, { saleCount: number; saleQuantityTotal: number }>();
  for (const sale of sales ?? []) {
    if (!sale.visit_id) continue;
    const current = saleStatsByVisit.get(sale.visit_id) ?? { saleCount: 0, saleQuantityTotal: 0 };
    current.saleCount += 1;
    current.saleQuantityTotal += Math.max(0, Number(sale.quantity ?? 0));
    saleStatsByVisit.set(sale.visit_id, current);
  }

  const visitPoints: CampaignMapPoint[] = (visits ?? []).map((row) => ({
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
      saleCount: saleStatsByVisit.get(row.id)?.saleCount ?? 0,
      saleQuantityTotal: saleStatsByVisit.get(row.id)?.saleQuantityTotal ?? 0,
    }));

  if (source === "visits_only") return visitPoints;

  const salePoints: CampaignMapPoint[] = (sales ?? [])
    .filter((row) => Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude)))
    .map((row) => ({
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
    }));

  return [...visitPoints, ...salePoints];
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
  const outletIdByVisitId = new Map(visitRows.map((item) => [item.id, item.outlet_id ?? null]));
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
    outletIds.length ? supabase.from("outlets").select("id, name, contact_person, lga, phone, address").in("id", outletIds) : Promise.resolve({ data: [] as Array<{ id: string; name: string; contact_person: string | null; lga: string | null; phone: string | null; address: string | null }> }),
    userIds.length ? supabase.from("profiles").select("user_id, full_name").in("user_id", userIds) : Promise.resolve({ data: [] as Array<{ user_id: string; full_name: string | null }> }),
  ]);

  const saleByVisit = new Map<string, Array<{ id: string; product_name: string | null; quantity: number | null; conversion_status: string | null }>>();
  const convertedOutletIds = new Set<string>();
  for (const item of salesRows ?? []) {
    const list = saleByVisit.get(item.visit_id) ?? [];
    list.push({
      id: item.id,
      product_name: item.product_name ?? null,
      quantity: item.quantity ?? null,
      conversion_status: item.conversion_status ?? null,
    });
    saleByVisit.set(item.visit_id, list);
    const outletId = outletIdByVisitId.get(item.visit_id);
    if ((Number(item.quantity ?? 0) > 0 || item.conversion_status === "converted") && outletId) {
      convertedOutletIds.add(outletId);
    }
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
      outletPhone: outlet?.phone ?? "N/A",
      outletAddress: outlet?.address ?? "N/A",
      outletStatus: row.outlet_id && convertedOutletIds.has(row.outlet_id) ? "Converted" : "Onboarded",
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
  campaignId: string,
  filters?: { dateFrom?: string | null; dateTo?: string | null }
): Promise<CampaignEvidenceItem[]> {
  const { data: evidenceRows } = await supabase
    .from("visit_evidence")
    .select("id, visit_id, file_url, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(300);

  const filtered = (evidenceRows ?? []).filter((row) => Boolean(row.visit_id));
  const visitIds = [...new Set(filtered.map((row) => row.visit_id))] as string[];
  let visitsForEvidenceQuery = supabase
      .from("visits")
      .select("id, campaign_id, outlet_id, agent_id")
      .eq("organization_id", organizationId)
      .eq("campaign_id", campaignId);
  if (filters?.dateFrom) visitsForEvidenceQuery = visitsForEvidenceQuery.gte("created_at", `${filters.dateFrom}T00:00:00.000Z`);
  if (filters?.dateTo) visitsForEvidenceQuery = visitsForEvidenceQuery.lte("created_at", `${filters.dateTo}T23:59:59.999Z`);
  const { data: visits } = visitIds.length
    ? await visitsForEvidenceQuery.in("id", visitIds)
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
