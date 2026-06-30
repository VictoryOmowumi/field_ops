export type PerformanceGroupBy = "date" | "area" | "agent";
export type PerformanceRowType = "detail" | "subtotal_area" | "subtotal_date" | "grand_total";

export type PerformanceFilters = {
  campaignId?: string;
  dateFrom?: string;
  dateTo?: string;
  groupBy: PerformanceGroupBy;
};

export type PerformanceRow = {
  groupKey: string;
  rowType: PerformanceRowType;
  level: 0 | 1 | 2;
  date: string | null;
  area: string;
  agentId: string | null;
  agentName: string;
  plannedVisits: number;
  achievedVisits: number;
  visitAchievementRate: number;
  plannedConversions: number;
  achievedConversions: number;
  conversionRate: number;
  plannedSalesValue: number;
  achievedSalesValue: number;
  salesAchievementRate: number;
  plannedSamples: number;
  achievedSamples: number;
  samplingAchievementRate: number;
  posmDeployedOutlets: number;
};

export type PerformanceMeta = {
  groupBy: "hierarchy";
  filtersApplied: {
    campaignId: string | null;
    dateFrom: string | null;
    dateTo: string | null;
    isDefaultWindow: boolean;
  };
};

export type AggregatedPerformanceResult = {
  rows: PerformanceRow[];
  totals: PerformanceRow;
  meta: PerformanceMeta;
};
