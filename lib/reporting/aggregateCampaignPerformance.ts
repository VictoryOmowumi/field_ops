import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AggregatedPerformanceResult,
  PerformanceFilters,
  PerformanceMeta,
  PerformanceRow,
} from "@/lib/reporting/types";

type VisitRow = {
  id: string;
  created_at: string;
  campaign_id: string | null;
  outlet_id: string | null;
  agent_id: string | null;
  lga: string | null;
  task_payload: unknown;
};

type SaleRow = {
  id: string;
  created_at: string;
  campaign_id: string | null;
  outlet_id: string | null;
  visit_id: string | null;
  quantity: number | null;
  sales_value: number | null;
};

type CampaignTargetRow = {
  id: string;
  target_outlets: number | null;
  target_conversions: number | null;
  runtime_form_config: unknown;
};

type ProfileRow = {
  user_id: string;
  full_name: string | null;
};

type DetailBucket = {
  row: PerformanceRow;
  visitedOutlets: Set<string>;
  convertedOutlets: Set<string>;
  posmOutlets: Set<string>;
};

function asNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function extractFreeSampleTarget(config: unknown) {
  const tasks = (config as { tasks?: Record<string, Record<string, unknown>> } | null)?.tasks ?? {};
  const freeSample = tasks.free_sample_distribution ?? {};
  const target = asNumber(freeSample.targetQuantity);
  return target > 0 ? target : 0;
}

function extractSalesTarget(config: unknown) {
  const tasks = (config as { tasks?: Record<string, Record<string, unknown>> } | null)?.tasks ?? {};
  const sellTask = tasks.sell_to_outlet ?? {};
  const candidates = [sellTask.targetSalesValue, sellTask.targetValue, sellTask.salesTarget];
  for (const candidate of candidates) {
    const amount = asNumber(candidate);
    if (amount > 0) return amount;
  }
  return 0;
}

function toIsoDay(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

function rate(achieved: number, planned: number) {
  if (planned <= 0) return 0;
  return (achieved / planned) * 100;
}

function createRow(input: {
  groupKey: string;
  rowType: PerformanceRow["rowType"];
  level: PerformanceRow["level"];
  date: string | null;
  area: string;
  agentId: string | null;
  agentName: string;
}): PerformanceRow {
  return {
    groupKey: input.groupKey,
    rowType: input.rowType,
    level: input.level,
    date: input.date,
    area: input.area,
    agentId: input.agentId,
    agentName: input.agentName,
    plannedVisits: 0,
    achievedVisits: 0,
    visitAchievementRate: 0,
    plannedConversions: 0,
    achievedConversions: 0,
    conversionRate: 0,
    plannedSalesValue: 0,
    achievedSalesValue: 0,
    salesAchievementRate: 0,
    plannedSamples: 0,
    achievedSamples: 0,
    samplingAchievementRate: 0,
    posmDeployedOutlets: 0,
  };
}

function finalizeRates(row: PerformanceRow) {
  row.visitAchievementRate = rate(row.achievedVisits, row.plannedVisits);
  row.conversionRate = rate(row.achievedConversions, row.plannedConversions);
  row.salesAchievementRate = rate(row.achievedSalesValue, row.plannedSalesValue);
  row.samplingAchievementRate = rate(row.achievedSamples, row.plannedSamples);
}

function addMetrics(target: PerformanceRow, source: PerformanceRow) {
  target.achievedVisits += source.achievedVisits;
  target.achievedConversions += source.achievedConversions;
  target.achievedSalesValue += source.achievedSalesValue;
  target.achievedSamples += source.achievedSamples;
  target.posmDeployedOutlets += source.posmDeployedOutlets;
}

export async function aggregateCampaignPerformance(
  supabase: SupabaseClient,
  organizationId: string,
  filters: PerformanceFilters
): Promise<AggregatedPerformanceResult> {
  let visitsQuery = supabase
    .from("visits")
    .select("id, created_at, campaign_id, outlet_id, agent_id, lga, task_payload")
    .eq("organization_id", organizationId);
  let salesQuery = supabase
    .from("sales")
    .select("id, created_at, campaign_id, outlet_id, visit_id, quantity, sales_value")
    .eq("organization_id", organizationId);

  if (filters.campaignId && filters.campaignId !== "all") {
    visitsQuery = visitsQuery.eq("campaign_id", filters.campaignId);
    salesQuery = salesQuery.eq("campaign_id", filters.campaignId);
  }
  if (filters.dateFrom) {
    visitsQuery = visitsQuery.gte("created_at", `${filters.dateFrom}T00:00:00.000Z`);
    salesQuery = salesQuery.gte("created_at", `${filters.dateFrom}T00:00:00.000Z`);
  }
  if (filters.dateTo) {
    visitsQuery = visitsQuery.lte("created_at", `${filters.dateTo}T23:59:59.999Z`);
    salesQuery = salesQuery.lte("created_at", `${filters.dateTo}T23:59:59.999Z`);
  }

  const [{ data: visits, error: visitsError }, { data: sales, error: salesError }, { data: profiles }] = await Promise.all([
    visitsQuery,
    salesQuery,
    supabase.from("profiles").select("user_id, full_name"),
  ]);
  if (visitsError) throw new Error(visitsError.message);
  if (salesError) throw new Error(salesError.message);

  const visitRows = (visits ?? []) as VisitRow[];
  const saleRows = (sales ?? []) as SaleRow[];
  const profileRows = (profiles ?? []) as ProfileRow[];
  const profileMap = new Map(profileRows.map((p) => [p.user_id, p.full_name ?? "Unknown Agent"]));
  const visitMap = new Map(visitRows.map((visit) => [visit.id, visit]));

  const campaignIds = new Set<string>();
  for (const visit of visitRows) if (visit.campaign_id) campaignIds.add(visit.campaign_id);
  for (const sale of saleRows) if (sale.campaign_id) campaignIds.add(sale.campaign_id);
  const activeCampaignIds = [...campaignIds];
  const { data: campaigns } = activeCampaignIds.length
    ? await supabase
        .from("campaigns")
        .select("id, target_outlets, target_conversions, runtime_form_config")
        .eq("organization_id", organizationId)
        .in("id", activeCampaignIds)
    : { data: [] as CampaignTargetRow[] };
  const campaignRows = (campaigns ?? []) as CampaignTargetRow[];

  const plannedTotals = campaignRows.reduce(
    (acc, campaign) => {
      acc.visits += Math.max(0, asNumber(campaign.target_outlets));
      acc.conversions += Math.max(0, asNumber(campaign.target_conversions));
      acc.sales += Math.max(0, extractSalesTarget(campaign.runtime_form_config));
      acc.samples += Math.max(0, extractFreeSampleTarget(campaign.runtime_form_config));
      return acc;
    },
    { visits: 0, conversions: 0, sales: 0, samples: 0 }
  );

  const detailMap = new Map<string, DetailBucket>();
  for (const visit of visitRows) {
    const date = toIsoDay(visit.created_at);
    const area = (visit.lga ?? "Unknown Area").trim() || "Unknown Area";
    const agentId = visit.agent_id ?? "unassigned";
    const agentName = visit.agent_id ? (profileMap.get(visit.agent_id) ?? "Unknown Agent") : "Unassigned";
    const key = `${date}__${area}__${agentId}`;
    const existing = detailMap.get(key) ?? {
      row: createRow({
        groupKey: key,
        rowType: "detail",
        level: 2,
        date,
        area,
        agentId: visit.agent_id,
        agentName,
      }),
      visitedOutlets: new Set<string>(),
      convertedOutlets: new Set<string>(),
      posmOutlets: new Set<string>(),
    };

    if (visit.outlet_id) existing.visitedOutlets.add(visit.outlet_id);
    const payload = (visit.task_payload ?? {}) as {
      activities?: Array<{ activityId?: string; payload?: Record<string, unknown> }>;
    };
    for (const activity of payload.activities ?? []) {
      if (activity.activityId === "free_sample_distribution" && activity.payload?.given === true) {
        const qty = asNumber(activity.payload?.quantity);
        if (qty > 0) existing.row.achievedSamples += qty;
      }
      if (activity.activityId === "posm_deployment" && activity.payload?.deployed === true && visit.outlet_id) {
        existing.posmOutlets.add(visit.outlet_id);
      }
    }
    detailMap.set(key, existing);
  }

  for (const sale of saleRows) {
    const validSale = asNumber(sale.quantity) > 0 || asNumber(sale.sales_value) > 0;
    if (!validSale) continue;
    const sourceVisit = sale.visit_id ? visitMap.get(sale.visit_id) : null;
    if (!sourceVisit) continue;
    const date = toIsoDay(sourceVisit.created_at);
    const area = (sourceVisit.lga ?? "Unknown Area").trim() || "Unknown Area";
    const agentId = sourceVisit.agent_id ?? "unassigned";
    const agentName = sourceVisit.agent_id ? (profileMap.get(sourceVisit.agent_id) ?? "Unknown Agent") : "Unassigned";
    const key = `${date}__${area}__${agentId}`;
    const existing = detailMap.get(key) ?? {
      row: createRow({
        groupKey: key,
        rowType: "detail",
        level: 2,
        date,
        area,
        agentId: sourceVisit.agent_id,
        agentName,
      }),
      visitedOutlets: new Set<string>(),
      convertedOutlets: new Set<string>(),
      posmOutlets: new Set<string>(),
    };
    if (sale.outlet_id) existing.convertedOutlets.add(sale.outlet_id);
    existing.row.achievedSalesValue += asNumber(sale.sales_value);
    detailMap.set(key, existing);
  }

  const detailRows = [...detailMap.values()].map((bucket) => {
    bucket.row.achievedVisits = bucket.visitedOutlets.size;
    bucket.row.achievedConversions = bucket.convertedOutlets.size;
    bucket.row.posmDeployedOutlets = bucket.posmOutlets.size;
    return bucket.row;
  });

  const activeGroupCount = Math.max(1, detailRows.length);
  const plannedPerDetail = {
    visits: plannedTotals.visits / activeGroupCount,
    conversions: plannedTotals.conversions / activeGroupCount,
    sales: plannedTotals.sales / activeGroupCount,
    samples: plannedTotals.samples / activeGroupCount,
  };
  for (const row of detailRows) {
    row.plannedVisits = plannedPerDetail.visits;
    row.plannedConversions = plannedPerDetail.conversions;
    row.plannedSalesValue = plannedPerDetail.sales;
    row.plannedSamples = plannedPerDetail.samples;
    finalizeRates(row);
  }

  const dateAreaMap = new Map<string, Map<string, PerformanceRow[]>>();
  for (const row of detailRows) {
    const date = row.date ?? "Unknown Date";
    const areas = dateAreaMap.get(date) ?? new Map<string, PerformanceRow[]>();
    const list = areas.get(row.area) ?? [];
    list.push(row);
    areas.set(row.area, list);
    dateAreaMap.set(date, areas);
  }

  const hierarchyRows: PerformanceRow[] = [];
  const orderedDates = [...dateAreaMap.keys()].sort((a, b) => a.localeCompare(b));
  for (const date of orderedDates) {
    const areas = dateAreaMap.get(date)!;
    const orderedAreas = [...areas.keys()].sort((a, b) => a.localeCompare(b));

    const dateSubtotal = createRow({
      groupKey: `subtotal-date-${date}`,
      rowType: "subtotal_date",
      level: 0,
      date,
      area: "All Areas",
      agentId: null,
      agentName: "Date Subtotal",
    });

    for (const area of orderedAreas) {
      const agentRows = [...(areas.get(area) ?? [])].sort((a, b) => a.agentName.localeCompare(b.agentName));
      const areaSubtotal = createRow({
        groupKey: `subtotal-area-${date}-${area}`,
        rowType: "subtotal_area",
        level: 1,
        date,
        area,
        agentId: null,
        agentName: "Area Subtotal",
      });

      for (const agentRow of agentRows) {
        hierarchyRows.push(agentRow);
        addMetrics(areaSubtotal, agentRow);
      }

      areaSubtotal.plannedVisits = plannedPerDetail.visits * agentRows.length;
      areaSubtotal.plannedConversions = plannedPerDetail.conversions * agentRows.length;
      areaSubtotal.plannedSalesValue = plannedPerDetail.sales * agentRows.length;
      areaSubtotal.plannedSamples = plannedPerDetail.samples * agentRows.length;
      finalizeRates(areaSubtotal);
      hierarchyRows.push(areaSubtotal);
      addMetrics(dateSubtotal, areaSubtotal);
      dateSubtotal.plannedVisits += areaSubtotal.plannedVisits;
      dateSubtotal.plannedConversions += areaSubtotal.plannedConversions;
      dateSubtotal.plannedSalesValue += areaSubtotal.plannedSalesValue;
      dateSubtotal.plannedSamples += areaSubtotal.plannedSamples;
    }

    finalizeRates(dateSubtotal);
    hierarchyRows.push(dateSubtotal);
  }

  const totals = createRow({
    groupKey: "TOTAL",
    rowType: "grand_total",
    level: 0,
    date: null,
    area: "All Areas",
    agentId: null,
    agentName: "Grand Total",
  });
  totals.plannedVisits = plannedTotals.visits;
  totals.plannedConversions = plannedTotals.conversions;
  totals.plannedSalesValue = plannedTotals.sales;
  totals.plannedSamples = plannedTotals.samples;
  for (const row of detailRows) addMetrics(totals, row);
  finalizeRates(totals);

  const meta: PerformanceMeta = {
    groupBy: "hierarchy",
    filtersApplied: {
      campaignId: filters.campaignId && filters.campaignId !== "all" ? filters.campaignId : null,
      dateFrom: filters.dateFrom ?? null,
      dateTo: filters.dateTo ?? null,
    },
  };

  return { rows: hierarchyRows, totals, meta };
}
