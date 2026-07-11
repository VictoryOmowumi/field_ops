import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  CampaignActivityRow,
  CampaignAnalyticsSummary,
  CampaignEvidenceItem,
  CampaignEvidencePagination,
  CampaignMapPoint,
} from "@/types/campaign-intelligence";
import { storageProvider } from "@/lib/storage";

type ActivityFilters = {
  page?: number;
  pageSize?: number;
  dateFrom?: string | null;
  dateTo?: string | null;
  area?: string | null;
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

type OutletLite = {
  name?: string | null;
  contact_person?: string | null;
  lga?: string | null;
  phone?: string | null;
  address?: string | null;
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
  const MAX_VALIDATED_POSM_UNITS = 100;
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
      if (Number.isFinite(quantity) && quantity > 0 && quantity <= MAX_VALIDATED_POSM_UNITS) {
        posmUnits += quantity;
      }
    }
  }
  return {
    posmChecks,
    posmDeployed,
    posmUnits,
    posmDeploymentRate: posmChecks > 0 ? (posmDeployed / posmChecks) * 100 : 0,
  };
}

function extractDistributedFreeSamplesFromVisits(visits: MetricsVisitRow[]) {
  let distributedFreeSamples = 0;
  for (const visit of visits) {
    const payload = (visit.task_payload ?? {}) as {
      activities?: Array<{ activityId?: string; payload?: Record<string, unknown> }>;
    };
    const freeSample = payload.activities?.find((item) => item.activityId === "free_sample_distribution");
    if (!freeSample) continue;
    const given = Boolean(freeSample.payload?.given);
    if (!given) continue;
    const quantity = Number(freeSample.payload?.quantity ?? 0);
    if (Number.isFinite(quantity) && quantity > 0) distributedFreeSamples += quantity;
  }
  return distributedFreeSamples;
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
  let unitsSold = 0;
  for (const sale of sales) {
    if (!isQualifyingSaleForConversion(sale)) continue;
    qualifyingSalesRows += 1;
    const quantity = Number(sale.quantity ?? 0);
    if (Number.isFinite(quantity) && quantity > 0) unitsSold += quantity;
    if (sale.visit_id) convertedVisitIds.add(sale.visit_id);
    if (sale.outlet_id) convertedOutletIds.add(sale.outlet_id);
  }
  const conversions = convertedVisitIds.size;
  const convertedOutlets = convertedOutletIds.size;
  const conversionRate = achievedVisits > 0 ? (convertedOutlets / achievedVisits) * 100 : 0;

  const syncedVisits = visits.filter((item) => item.sync_status === "synced").length;
  const syncHealth = totalSubmissions > 0 ? (syncedVisits / totalSubmissions) * 100 : 100;

  const posm = extractPosmFromVisits(visits);
  const distributedFreeSamples = extractDistributedFreeSamplesFromVisits(visits);

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
    salesCount: qualifyingSalesRows,
    unitsSold,
    achievedVisits,
    uniqueOutlets,
    areasCovered,
    conversionRate,
    syncHealth,
    posmChecks: posm.posmChecks,
    posmDeployed: posm.posmDeployed,
    posmUnits: posm.posmUnits,
    posmDeploymentRate: posm.posmDeploymentRate,
    plannedFreeSamples: 0,
    distributedFreeSamples,
    remainingFreeSamples: 0,
    freeSampleAchievementRate: 0,
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
  filters?: { dateFrom?: string | null; dateTo?: string | null; area?: string | null }
): Promise<CampaignAnalyticsSummary> {
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("runtime_form_config")
    .eq("organization_id", organizationId)
    .eq("id", campaignId)
    .maybeSingle();
  if (campaignError) throw new Error(`Failed to load campaign config for analytics: ${campaignError.message}`);

  const tasks = ((campaign?.runtime_form_config as { tasks?: Record<string, Record<string, unknown>> } | null)?.tasks ?? {});
  const freeSampleConfig = tasks.free_sample_distribution ?? {};
  const needsTaskPayload = Boolean(tasks.posm_deployment) || Boolean(freeSampleConfig.enabled);
  const hasAreaFilter = Boolean(filters?.area && filters.area !== "all");
  // Only fall back to a full row fetch when there's an explicit area filter — that bounds the
  // row count to one LGA, so fetching task_payload there is cheap. POSM/free-sample aggregation
  // is now computed by the RPC itself, so a campaign-wide row fetch (which is what was timing
  // out on large campaigns) is never needed just because POSM/free-sample tasks are configured.
  const needsRowFetch = hasAreaFilter;

  let salesQuery = supabase
    .from("sales")
    .select("id, created_at, visit_id, outlet_id, quantity, sales_value")
    .eq("organization_id", organizationId)
    .eq("campaign_id", campaignId);
  if (filters?.dateFrom) salesQuery = salesQuery.gte("created_at", `${filters.dateFrom}T00:00:00.000Z`);
  if (filters?.dateTo) salesQuery = salesQuery.lte("created_at", `${filters.dateTo}T23:59:59.999Z`);

  let summary: CampaignAnalyticsSummary;

  if (needsRowFetch) {
    const visitColumns = needsTaskPayload
      ? "id, created_at, outcome, sync_status, outlet_id, state, lga, task_payload"
      : "id, created_at, outcome, sync_status, outlet_id, state, lga";
    let visitsQuery = supabase
      .from("visits")
      .select(visitColumns)
      .eq("organization_id", organizationId)
      .eq("campaign_id", campaignId);
    if (filters?.dateFrom) visitsQuery = visitsQuery.gte("created_at", `${filters.dateFrom}T00:00:00.000Z`);
    if (filters?.dateTo) visitsQuery = visitsQuery.lte("created_at", `${filters.dateTo}T23:59:59.999Z`);
    if (hasAreaFilter) visitsQuery = visitsQuery.eq("lga", filters?.area as string);

    const [{ data: visits, error: visitsError }, { data: sales, error: salesError }] = await Promise.all([
      visitsQuery,
      salesQuery,
    ]);
    if (visitsError) throw new Error(`Failed to load visits for analytics: ${visitsError.message}`);
    if (salesError) throw new Error(`Failed to load sales for analytics: ${salesError.message}`);

    const scopedVisits = (visits ?? []) as unknown as MetricsVisitRow[];
    const scopedVisitIds = new Set(scopedVisits.map((row) => row.id));
    const scopedSales = hasAreaFilter
      ? ((sales ?? []) as MetricsSaleRow[]).filter((row) => row.visit_id && scopedVisitIds.has(row.visit_id))
      : ((sales ?? []) as MetricsSaleRow[]);
    summary = computeMetricsFromRows(scopedVisits, scopedSales, `campaign:${campaignId}`).summary;
  } else {
    const rpcParams = {
      p_organization_id: organizationId,
      p_campaign_id: campaignId,
      p_date_from: filters?.dateFrom ? `${filters.dateFrom}T00:00:00.000Z` : null,
      p_date_to: filters?.dateTo ? `${filters.dateTo}T23:59:59.999Z` : null,
    };
    const [{ data: counts, error: rpcError }, { data: extras, error: extrasError }] = await Promise.all([
      supabase.rpc("visit_metrics_summary", rpcParams).single(),
      supabase.rpc("dashboard_summary_extras", rpcParams).single(),
    ]);
    if (rpcError) throw new Error(`Failed to load visit metrics for analytics: ${rpcError.message}`);
    if (extrasError) throw new Error(`Failed to load sales metrics for analytics: ${extrasError.message}`);

    const countsRow = counts as {
      total_visits: number;
      unique_outlets: number;
      unique_areas: number;
      synced_visits: number;
      posm_checks: number;
      posm_deployed: number;
      posm_units: number;
      distributed_free_samples: number;
    } | null;
    const extrasRow = extras as {
      qualifying_sales_count: number;
      units_sold: number;
      distinct_converted_outlets: number;
      distinct_converted_visits: number;
    } | null;
    const totalVisits = Number(countsRow?.total_visits ?? 0);
    const uniqueOutlets = Number(countsRow?.unique_outlets ?? 0);
    const posmChecks = Number(countsRow?.posm_checks ?? 0);
    const posmDeployed = Number(countsRow?.posm_deployed ?? 0);
    const convertedOutlets = Number(extrasRow?.distinct_converted_outlets ?? 0);
    summary = {
      totalSubmissions: totalVisits,
      conversions: Number(extrasRow?.distinct_converted_visits ?? 0),
      convertedOutlets,
      salesCount: Number(extrasRow?.qualifying_sales_count ?? 0),
      unitsSold: Number(extrasRow?.units_sold ?? 0),
      uniqueOutlets,
      achievedVisits: uniqueOutlets,
      areasCovered: Number(countsRow?.unique_areas ?? 0),
      syncHealth: totalVisits > 0 ? (Number(countsRow?.synced_visits ?? 0) / totalVisits) * 100 : 100,
      conversionRate: uniqueOutlets > 0 ? (convertedOutlets / uniqueOutlets) * 100 : 0,
      posmChecks,
      posmDeployed,
      posmUnits: Number(countsRow?.posm_units ?? 0),
      posmDeploymentRate: posmChecks > 0 ? (posmDeployed / posmChecks) * 100 : 0,
      plannedFreeSamples: 0,
      distributedFreeSamples: Number(countsRow?.distributed_free_samples ?? 0),
      remainingFreeSamples: 0,
      freeSampleAchievementRate: 0,
      recentTrend: [],
    };
  }

  const plannedValue = Number(freeSampleConfig.targetQuantity ?? 0);
  const plannedFreeSamples = Number.isFinite(plannedValue) && plannedValue > 0 ? plannedValue : 0;
  const distributedFreeSamples = summary.distributedFreeSamples ?? 0;
  return {
    ...summary,
    plannedFreeSamples,
    remainingFreeSamples: Math.max(0, plannedFreeSamples - distributedFreeSamples),
    freeSampleAchievementRate: plannedFreeSamples > 0 ? (distributedFreeSamples / plannedFreeSamples) * 100 : 0,
  };
}

/** Runs the full (unfiltered) analytics computation and freezes it into campaign_analytics_snapshots. */
export async function computeAndStoreCampaignAnalyticsSnapshot(
  supabase: SupabaseClient,
  organizationId: string,
  campaignId: string
): Promise<CampaignAnalyticsSummary> {
  const summary = await getCampaignAnalyticsSummary(supabase, organizationId, campaignId);
  const { error } = await supabase.from("campaign_analytics_snapshots").upsert(
    {
      campaign_id: campaignId,
      organization_id: organizationId,
      total_submissions: summary.totalSubmissions,
      conversions: summary.conversions,
      converted_outlets: summary.convertedOutlets,
      sales_count: summary.salesCount ?? 0,
      units_sold: summary.unitsSold ?? 0,
      achieved_visits: summary.achievedVisits,
      unique_outlets: summary.uniqueOutlets,
      areas_covered: summary.areasCovered,
      conversion_rate: summary.conversionRate,
      sync_health: summary.syncHealth,
      posm_checks: summary.posmChecks,
      posm_deployed: summary.posmDeployed,
      posm_units: summary.posmUnits,
      posm_deployment_rate: summary.posmDeploymentRate,
      planned_free_samples: summary.plannedFreeSamples ?? 0,
      distributed_free_samples: summary.distributedFreeSamples ?? 0,
      remaining_free_samples: summary.remainingFreeSamples ?? 0,
      free_sample_achievement_rate: summary.freeSampleAchievementRate ?? 0,
      computed_at: new Date().toISOString(),
    },
    { onConflict: "campaign_id" }
  );
  if (error) throw new Error(`Failed to store campaign analytics snapshot: ${error.message}`);
  return summary;
}

function snapshotRowToSummary(row: Record<string, unknown>): CampaignAnalyticsSummary {
  return {
    totalSubmissions: Number(row.total_submissions ?? 0),
    conversions: Number(row.conversions ?? 0),
    convertedOutlets: Number(row.converted_outlets ?? 0),
    salesCount: Number(row.sales_count ?? 0),
    unitsSold: Number(row.units_sold ?? 0),
    achievedVisits: Number(row.achieved_visits ?? 0),
    uniqueOutlets: Number(row.unique_outlets ?? 0),
    areasCovered: Number(row.areas_covered ?? 0),
    conversionRate: Number(row.conversion_rate ?? 0),
    syncHealth: Number(row.sync_health ?? 0),
    posmChecks: Number(row.posm_checks ?? 0),
    posmDeployed: Number(row.posm_deployed ?? 0),
    posmUnits: Number(row.posm_units ?? 0),
    posmDeploymentRate: Number(row.posm_deployment_rate ?? 0),
    plannedFreeSamples: Number(row.planned_free_samples ?? 0),
    distributedFreeSamples: Number(row.distributed_free_samples ?? 0),
    remainingFreeSamples: Number(row.remaining_free_samples ?? 0),
    freeSampleAchievementRate: Number(row.free_sample_achievement_rate ?? 0),
    recentTrend: [],
  };
}

/**
 * Serves the frozen snapshot for a completed/archived campaign instead of re-running the live
 * RPCs. Falls back to computing (and storing) one on the spot if it doesn't exist yet, so
 * campaigns that completed before this table existed self-heal on first read rather than needing
 * a separate backfill migration. Only valid for the unfiltered view — a date/area-filtered slice
 * still needs the live query, since the snapshot only ever represents the full campaign lifetime.
 */
export async function getCampaignAnalyticsSnapshot(
  supabase: SupabaseClient,
  organizationId: string,
  campaignId: string
): Promise<CampaignAnalyticsSummary> {
  const { data: existing, error } = await supabase
    .from("campaign_analytics_snapshots")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("campaign_id", campaignId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load campaign analytics snapshot: ${error.message}`);
  if (existing) return snapshotRowToSummary(existing);

  return computeAndStoreCampaignAnalyticsSnapshot(supabase, organizationId, campaignId);
}

export async function getCampaignMetricsDiagnostics(
  supabase: SupabaseClient,
  organizationId: string,
  campaignId: string
): Promise<MetricsDiagnostics> {
  const [{ data: visits, error: visitsError }, { data: sales, error: salesError }] = await Promise.all([
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
  if (visitsError) throw new Error(`Failed to load visits diagnostics: ${visitsError.message}`);
  if (salesError) throw new Error(`Failed to load sales diagnostics: ${salesError.message}`);
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
  options?: {
    source?: "visits_only" | "visits_and_sales";
    dateFrom?: string | null;
    dateTo?: string | null;
    area?: string | null;
    page?: number;
    pageSize?: number;
  }
): Promise<CampaignMapPoint[]> {
  const source = options?.source ?? "visits_and_sales";
  const page = Math.max(1, options?.page ?? 1);
  const pageSize = Math.min(500, Math.max(20, options?.pageSize ?? 200));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  let visitsQuery = supabase
      .from("visits")
      .select("id, created_at, outcome, sync_status, outlet_id, agent_id, latitude, longitude, lga, outlets(name)")
      .eq("organization_id", organizationId)
      .eq("campaign_id", campaignId)
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .order("created_at", { ascending: false })
      .range(from, to);
  if (options?.dateFrom) visitsQuery = visitsQuery.gte("created_at", `${options.dateFrom}T00:00:00.000Z`);
  if (options?.dateTo) visitsQuery = visitsQuery.lte("created_at", `${options.dateTo}T23:59:59.999Z`);
  if (options?.area && options.area !== "all") visitsQuery = visitsQuery.eq("lga", options.area);
  let salesQuery = supabase
      .from("sales")
      .select("id, created_at, conversion_status, sync_status, outlet_id, agent_id, latitude, longitude, visit_id, quantity, outlets(name)")
      .eq("organization_id", organizationId)
      .eq("campaign_id", campaignId);
  if (options?.dateFrom) salesQuery = salesQuery.gte("created_at", `${options.dateFrom}T00:00:00.000Z`);
  if (options?.dateTo) salesQuery = salesQuery.lte("created_at", `${options.dateTo}T23:59:59.999Z`);
  const { data: visits } = await visitsQuery;
  const scopedVisits = visits ?? [];
  const scopedVisitIds = new Set(scopedVisits.map((row) => row.id));
  const { data: sales } =
    source === "visits_only" || scopedVisitIds.size === 0
      ? { data: [] as Array<{
          id: string;
          created_at: string;
          conversion_status: string | null;
          sync_status: string | null;
          outlet_id: string | null;
          agent_id: string | null;
          latitude: number | null;
          longitude: number | null;
          visit_id: string | null;
          quantity: number | null;
          outlets?: { name?: string | null };
        }> }
      : await salesQuery.in("visit_id", [...scopedVisitIds]);
  const scopedSales = (sales ?? []) as Array<{
    id: string;
    created_at: string;
    conversion_status: string | null;
    sync_status: string | null;
    outlet_id: string | null;
    agent_id: string | null;
    latitude: number | null;
    longitude: number | null;
    visit_id: string | null;
    quantity: number | null;
    outlets?: { name?: string | null };
  }>;

  const userIds = [
    ...new Set([...(scopedVisits ?? []).map((x) => x.agent_id), ...(scopedSales ?? []).map((x) => x.agent_id)].filter(Boolean)),
  ] as string[];

  const [{ data: profiles }] = await Promise.all([
    userIds.length ? supabase.from("profiles").select("user_id, full_name").in("user_id", userIds) : Promise.resolve({ data: [] as Array<{ user_id: string; full_name: string | null }> }),
  ]);

  const profileMap = new Map((profiles ?? []).map((x) => [x.user_id, x.full_name ?? "Unknown"]));
  const saleStatsByVisit = new Map<string, { saleCount: number; saleQuantityTotal: number }>();
  for (const sale of scopedSales ?? []) {
    if (!sale.visit_id) continue;
    const current = saleStatsByVisit.get(sale.visit_id) ?? { saleCount: 0, saleQuantityTotal: 0 };
    current.saleCount += 1;
    current.saleQuantityTotal += Math.max(0, Number(sale.quantity ?? 0));
    saleStatsByVisit.set(sale.visit_id, current);
  }

  const visitPoints: CampaignMapPoint[] = (scopedVisits ?? []).map((row) => ({
      id: `visit-${row.id}`,
      source: "visit" as const,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      outlet: (row as { outlets?: { name?: string | null } }).outlets?.name ?? "-",
      lga: row.lga ?? null,
      agent: row.agent_id ? profileMap.get(row.agent_id) ?? "-" : "-",
      status: row.outcome ?? "-",
      syncStatus: row.sync_status ?? "-",
      createdAt: row.created_at,
      saleCount: saleStatsByVisit.get(row.id)?.saleCount ?? 0,
      saleQuantityTotal: saleStatsByVisit.get(row.id)?.saleQuantityTotal ?? 0,
    }));

  if (source === "visits_only") return visitPoints;

  const salePoints: CampaignMapPoint[] = (scopedSales ?? [])
    .filter((row) => Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude)))
    .map((row) => ({
      id: `sale-${row.id}`,
      source: "sale" as const,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      outlet: (row as { outlets?: { name?: string | null } }).outlets?.name ?? "-",
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
  const pageSize = Math.min(5000, Math.max(10, filters.pageSize ?? 50));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let visitsQuery = supabase
    .from("visits")
    .select("id, outcome, task_type, task_payload, lga, latitude, longitude, created_at, outlet_id, agent_id, outlets(name, contact_person, lga, phone, address)", { count: "exact" })
    .eq("organization_id", organizationId)
    .eq("campaign_id", campaignId);
  if (filters.dateFrom) visitsQuery = visitsQuery.gte("created_at", `${filters.dateFrom}T00:00:00.000Z`);
  if (filters.dateTo) visitsQuery = visitsQuery.lte("created_at", `${filters.dateTo}T23:59:59.999Z`);
  if (filters.area && filters.area !== "all") visitsQuery = visitsQuery.eq("lga", filters.area);
  if (filters.status && filters.status !== "all") visitsQuery = visitsQuery.eq("outcome", filters.status);
  const { data: visits, count } = await visitsQuery.order("created_at", { ascending: false }).range(from, to);

  const visitRows = visits ?? [];
  const visitIds = visitRows.map((item) => item.id);
  const outletIdByVisitId = new Map(visitRows.map((item) => [item.id, item.outlet_id ?? null]));
  const userIds = [...new Set(visitRows.map((item) => item.agent_id).filter(Boolean))] as string[];

  const [{ data: salesRows }, { data: profiles }] = await Promise.all([
    visitIds.length
      ? supabase
          .from("sales")
          .select("id, visit_id, product_name, quantity, sales_value, conversion_status")
          .eq("organization_id", organizationId)
          .in("visit_id", visitIds)
      : Promise.resolve({ data: [] as Array<{ id: string; visit_id: string; product_name: string | null; quantity: number | null; sales_value: number | null; conversion_status: string | null }> }),
    userIds.length ? supabase.from("profiles").select("user_id, full_name").in("user_id", userIds) : Promise.resolve({ data: [] as Array<{ user_id: string; full_name: string | null }> }),
  ]);

  const saleByVisit = new Map<string, Array<{ id: string; product_name: string | null; quantity: number | null; sales_value: number | null; conversion_status: string | null }>>();
  const convertedOutletIds = new Set<string>();
  for (const item of salesRows ?? []) {
    const list = saleByVisit.get(item.visit_id) ?? [];
    list.push({
      id: item.id,
      product_name: item.product_name ?? null,
      quantity: item.quantity ?? null,
      sales_value: item.sales_value ?? null,
      conversion_status: item.conversion_status ?? null,
    });
    saleByVisit.set(item.visit_id, list);
    const outletId = outletIdByVisitId.get(item.visit_id);
    if ((Number(item.quantity ?? 0) > 0 || item.conversion_status === "converted") && outletId) {
      convertedOutletIds.add(outletId);
    }
  }
  const profileMap = new Map((profiles ?? []).map((x) => [x.user_id, x.full_name ?? "Unknown"]));

  let rows: CampaignActivityRow[] = visitRows.map((row) => {
    const saleLines = saleByVisit.get(row.id) ?? [];
    const hasValidSale = saleLines.some((line) => Number(line.quantity ?? 0) > 0 || Number(line.sales_value ?? 0) > 0);
    const outlet = (row as { outlets?: OutletLite | null }).outlets ?? null;
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
      status: hasValidSale ? "converted" : "onboarded",
      createdAt: row.created_at,
      customer: outlet?.contact_person ?? "-",
      outlet: outlet?.name ?? "-",
      outletPhone: outlet?.phone ?? "N/A",
      outletAddress: outlet?.address ?? "N/A",
      outletStatus: hasValidSale || (row.outlet_id ? convertedOutletIds.has(row.outlet_id) : false) ? "Converted" : "Onboarded",
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
  filters?: {
    dateFrom?: string | null;
    dateTo?: string | null;
    area?: string | null;
    page?: number;
    pageSize?: number;
    includeSigned?: boolean;
  }
): Promise<{ items: CampaignEvidenceItem[]; pagination: CampaignEvidencePagination }> {
  const page = Math.max(1, filters?.page ?? 1);
  const pageSize = Math.min(20, Math.max(1, filters?.pageSize ?? 20));
  const includeSigned = filters?.includeSigned ?? true;
  let visitsForEvidenceQuery = supabase
      .from("visits")
      .select("id, campaign_id, outlet_id, agent_id")
      .eq("organization_id", organizationId)
      .eq("campaign_id", campaignId);
  if (filters?.dateFrom) visitsForEvidenceQuery = visitsForEvidenceQuery.gte("created_at", `${filters.dateFrom}T00:00:00.000Z`);
  if (filters?.dateTo) visitsForEvidenceQuery = visitsForEvidenceQuery.lte("created_at", `${filters.dateTo}T23:59:59.999Z`);
  if (filters?.area && filters.area !== "all") visitsForEvidenceQuery = visitsForEvidenceQuery.eq("lga", filters.area);
  const { data: visits } = await visitsForEvidenceQuery.limit(3000);

  const visitMap = new Map((visits ?? []).map((item) => [item.id, item]));
  const visitIds = [...visitMap.keys()];
  const { data: evidenceRows, count: total } = visitIds.length
    ? await supabase
        .from("visit_evidence")
        .select("id, visit_id, file_url, storage_provider, created_at, file_name, file_type, file_size, original_file_name, original_file_size, compressed_file_size, mime_type", { count: "exact" })
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .in("visit_id", visitIds)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range((page - 1) * pageSize, (page - 1) * pageSize + pageSize - 1)
    : { data: [] as Array<{
      id: string;
      visit_id: string;
      file_url: string;
      storage_provider?: string | null;
      created_at: string;
      file_name?: string | null;
      file_type?: string | null;
      file_size?: number | null;
      original_file_name?: string | null;
      original_file_size?: number | null;
      compressed_file_size?: number | null;
      mime_type?: string | null;
    }>, count: 0 };
  const scopedEvidence = (evidenceRows ?? []).filter((row) => visitMap.has(row.visit_id));

  const outletIds = [...new Set((visits ?? []).map((item) => item.outlet_id).filter(Boolean))] as string[];
  const userIds = [...new Set((visits ?? []).map((item) => item.agent_id).filter(Boolean))] as string[];
  const [{ data: outlets }, { data: profiles }] = await Promise.all([
    outletIds.length ? supabase.from("outlets").select("id, name").in("id", outletIds) : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    userIds.length ? supabase.from("profiles").select("user_id, full_name").in("user_id", userIds) : Promise.resolve({ data: [] as Array<{ user_id: string; full_name: string | null }> }),
  ]);

  const signedMap = includeSigned
    ? await storageProvider.getEvidenceSignedUrls(
        scopedEvidence.map((row) => ({
          file_url: row.file_url,
          storage_provider: row.storage_provider === "r2" ? "r2" : "supabase",
        })),
        60 * 60
      )
    : new Map<string, string>();
  const outletMap = new Map((outlets ?? []).map((item) => [item.id, item.name]));
  const profileMap = new Map((profiles ?? []).map((item) => [item.user_id, item.full_name ?? "Unknown"]));

  const items = scopedEvidence.map((row) => {
    const visit = visitMap.get(row.visit_id);
    return {
      id: row.id,
      visit_id: row.visit_id,
      created_at: row.created_at,
      file_url: row.file_url,
      signed_url: signedMap.get(row.file_url) ?? null,
      file_name: row.file_name ?? null,
      file_type: row.file_type ?? null,
      file_size: row.file_size ?? null,
      original_file_name: row.original_file_name ?? null,
      original_file_size: row.original_file_size ?? null,
      compressed_file_size: row.compressed_file_size ?? null,
      mime_type: row.mime_type ?? null,
      outlet: visit?.outlet_id ? outletMap.get(visit.outlet_id) ?? "-" : "-",
      actor: visit?.agent_id ? profileMap.get(visit.agent_id) ?? "-" : "-",
    };
  });

  const totalCount = total ?? items.length;
  return {
    items,
    pagination: {
      page,
      pageSize,
      total: totalCount,
      hasMore: page * pageSize < totalCount,
    },
  };
}
