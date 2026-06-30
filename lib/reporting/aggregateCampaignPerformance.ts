import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveDateWindow } from "@/lib/server/query-window";
import type {
  AggregatedPerformanceResult,
  PerformanceFilters,
  PerformanceMeta,
  PerformanceRow,
} from "@/lib/reporting/types";

type PerformanceDetailRpcRow = {
  visit_date: string;
  area: string;
  agent_id: string | null;
  achieved_visits: number;
  achieved_conversions: number;
  achieved_sales_value: number;
  achieved_samples: number;
  posm_deployed_outlets: number;
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
  // No fallback here previously — landing on this page with no filters ran a
  // fully unbounded visits fetch including task_payload. 30 days matches the
  // default already used on reports/overview.
  const dateWindow = resolveDateWindow(filters.dateFrom ?? null, filters.dateTo ?? null, 30);
  const campaignId = filters.campaignId && filters.campaignId !== "all" ? filters.campaignId : null;
  const dateFromIso = dateWindow.dateFrom ? `${dateWindow.dateFrom}T00:00:00.000Z` : null;
  const dateToIso = dateWindow.dateTo ? `${dateWindow.dateTo}T23:59:59.999Z` : null;

  const [detailRes, { data: profiles }] = await Promise.all([
    supabase.rpc("reports_performance_detail", {
      p_organization_id: organizationId,
      p_campaign_id: campaignId,
      p_date_from: dateFromIso,
      p_date_to: dateToIso,
    }),
    supabase.from("profiles").select("user_id, full_name"),
  ]);
  if (detailRes.error) throw new Error(detailRes.error.message);

  const profileRows = (profiles ?? []) as ProfileRow[];
  const profileMap = new Map(profileRows.map((p) => [p.user_id, p.full_name ?? "Unknown Agent"]));

  // Planned targets come from campaign config, not visit/sale rows — when no
  // specific campaign is selected this now sums every campaign in the org
  // rather than only ones with activity in the filtered window (a small,
  // deliberate simplification now that the achieved side is RPC-aggregated).
  let campaignsQuery = supabase
    .from("campaigns")
    .select("id, target_outlets, target_conversions, runtime_form_config")
    .eq("organization_id", organizationId);
  if (campaignId) campaignsQuery = campaignsQuery.eq("id", campaignId);
  const { data: campaigns } = await campaignsQuery;
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

  const detailRows: PerformanceRow[] = ((detailRes.data ?? []) as PerformanceDetailRpcRow[]).map((bucket) => {
    const agentName = bucket.agent_id ? profileMap.get(bucket.agent_id) ?? "Unknown Agent" : "Unassigned";
    const key = `${bucket.visit_date}__${bucket.area}__${bucket.agent_id ?? "unassigned"}`;
    const row = createRow({
      groupKey: key,
      rowType: "detail",
      level: 2,
      date: bucket.visit_date,
      area: bucket.area,
      agentId: bucket.agent_id,
      agentName,
    });
    row.achievedVisits = Number(bucket.achieved_visits);
    row.achievedConversions = Number(bucket.achieved_conversions);
    row.achievedSalesValue = Number(bucket.achieved_sales_value);
    row.achievedSamples = Number(bucket.achieved_samples);
    row.posmDeployedOutlets = Number(bucket.posm_deployed_outlets);
    return row;
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
      campaignId,
      dateFrom: dateWindow.dateFrom,
      dateTo: dateWindow.dateTo,
      isDefaultWindow: dateWindow.isDefaultWindow,
    },
  };

  return { rows: hierarchyRows, totals, meta };
}
