"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import TableEmptyStateRow from "@/components/shared/TableEmptyStateRow";
import TableLoadingState from "@/components/shared/TableLoadingState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { authorizedFetch } from "@/lib/api/client";
import { supabaseClient } from "@/lib/supabase/client";
import type { PerformanceMeta, PerformanceRow } from "@/lib/reporting/types";

type PerformanceResponse = {
  success: boolean;
  rows: PerformanceRow[];
  totals: PerformanceRow;
  meta: PerformanceMeta;
};

export default function PerformanceReportsPage() {
  const [campaignId, setCampaignId] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [exporting, setExporting] = useState(false);
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set());
  const [collapsedAreas, setCollapsedAreas] = useState<Set<string>>(new Set());

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (campaignId !== "all") params.set("campaignId", campaignId);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    return `?${params.toString()}`;
  }, [campaignId, dateFrom, dateTo]);

  const campaignsQuery = useQuery({
    queryKey: ["admin-performance-campaigns"],
    queryFn: async () => {
      const result = await authorizedFetch<{ success: boolean; campaigns: Array<{ id: string; name: string }> }>("/api/admin/campaigns");
      return result.campaigns ?? [];
    },
  });

  const performanceQuery = useQuery({
    queryKey: ["admin-performance-aggregated", queryString],
    queryFn: async () => {
      return authorizedFetch<PerformanceResponse>(`/api/admin/reports/performance${queryString}`);
    },
  });

  if (campaignsQuery.error) toast.error((campaignsQuery.error as Error).message);
  if (performanceQuery.error) toast.error((performanceQuery.error as Error).message);

  const rows = useMemo(() => performanceQuery.data?.rows ?? [], [performanceQuery.data?.rows]);
  const totals = performanceQuery.data?.totals;
  const visibleRows = useMemo(() => {
    return rows.filter((row) => {
      if (!row.date) return true;
      if (row.rowType === "detail" || row.rowType === "subtotal_area") {
        if (collapsedDates.has(row.date)) return false;
      }
      if (row.rowType === "detail") {
        const areaKey = `${row.date}__${row.area}`;
        if (collapsedAreas.has(areaKey)) return false;
      }
      return true;
    });
  }, [rows, collapsedDates, collapsedAreas]);

  async function exportCsv() {
    setExporting(true);
    try {
      const { data } = await supabaseClient.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Session expired. Please sign in again.");
      const response = await fetch(`/api/admin/reports/performance/export${queryString}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? "Failed to export report.");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "campaign-performance.csv";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Performance CSV downloaded.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Performance Reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">Layer 2 aggregated KPI reporting by date, area, or agent.</p>
        </div>
        <Button className="rounded-full px-5" disabled={exporting} onClick={() => void exportCsv()}>
          {exporting ? "Exporting..." : "Export Aggregated CSV"}
        </Button>
      </div>

      <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <h2 className="font-medium">Filters</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Campaign</p>
            <Select value={campaignId} onValueChange={setCampaignId}>
              <SelectTrigger><SelectValue placeholder="All campaigns" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All campaigns</SelectItem>
                {(campaignsQuery.data ?? []).map((campaign) => (
                  <SelectItem key={campaign.id} value={campaign.id}>{campaign.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Date from</p>
            <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          </div>
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Date to</p>
            <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-full"
              onClick={() => {
                setCampaignId("all");
                setDateFrom("");
                setDateTo("");
                setCollapsedDates(new Set());
                setCollapsedAreas(new Set());
              }}
            >
              Clear Filters
            </Button>
          </div>
        </div>
      </section>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Planned visits" value={totals ? totals.plannedVisits.toFixed(2) : "-"} loading={performanceQuery.isLoading} />
        <Stat label="Achieved visits" value={totals ? String(totals.achievedVisits) : "-"} loading={performanceQuery.isLoading} />
        <Stat label="Visit achievement" value={totals ? `${totals.visitAchievementRate.toFixed(1)}%` : "-"} loading={performanceQuery.isLoading} />
        <Stat label="Sales achievement" value={totals ? `${totals.salesAchievementRate.toFixed(1)}%` : "-"} loading={performanceQuery.isLoading} />
      </div>

      <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <h2 className="font-medium">Aggregated KPI Table</h2>
        <p className="mt-1 text-sm text-muted-foreground">Fixed hierarchy: Date → Area → Agent. Targets are campaign-planned share allocations.</p>

        <div className="mt-4 overflow-x-auto rounded-3xl border border-border">
          <table className="min-w-400 w-full text-xs">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-3 py-3 text-left">Date</th>
                <th className="px-3 py-3 text-left">Area</th>
                <th className="px-3 py-3 text-left">Agent</th>
                <th className="px-3 py-3 text-left">Planned Visits</th>
                <th className="px-3 py-3 text-left">Achieved Visits</th>
                <th className="px-3 py-3 text-left">Visit %</th>
                <th className="px-3 py-3 text-left">Planned Conv.</th>
                <th className="px-3 py-3 text-left">Achieved Conv.</th>
                <th className="px-3 py-3 text-left">Conv. %</th>
                <th className="px-3 py-3 text-left">Planned Sales</th>
                <th className="px-3 py-3 text-left">Achieved Sales</th>
                <th className="px-3 py-3 text-left">Sales %</th>
                <th className="px-3 py-3 text-left">Planned Samples</th>
                <th className="px-3 py-3 text-left">Achieved Samples</th>
                <th className="px-3 py-3 text-left">Sample %</th>
                <th className="px-3 py-3 text-left">POSM Outlets</th>
              </tr>
            </thead>
            <tbody>
              {performanceQuery.isLoading ? (
                <TableLoadingState colSpan={16} title="Loading performance metrics..." description="Computing grouped KPI aggregates." />
              ) : visibleRows.length === 0 ? (
                <TableEmptyStateRow colSpan={16} title="No performance rows" description="Adjust your filters to see aggregated KPI rows." />
              ) : (
                visibleRows.map((row) => (
                  <tr
                    key={row.groupKey}
                    className={
                      row.rowType === "subtotal_date"
                        ? "border-t-2 border-primary/40 bg-primary/10 font-semibold"
                        : row.rowType === "subtotal_area"
                          ? "border-t border-border bg-muted/40 font-medium"
                          : "border-t border-border"
                    }
                  >
                    <td className="px-3 py-4">
                      {row.rowType === "subtotal_date" && row.date ? (
                        <button
                          type="button"
                          className="font-semibold text-primary"
                          onClick={() => {
                            setCollapsedDates((prev) => {
                              const next = new Set(prev);
                              if (next.has(row.date!)) next.delete(row.date!);
                              else next.add(row.date!);
                              return next;
                            });
                          }}
                        >
                          {collapsedDates.has(row.date) ? "▶ " : "▼ "}
                          {row.date}
                        </button>
                      ) : row.date ?? "-"}
                    </td>
                    <td className="px-3 py-4">
                      {row.rowType === "detail" ? <span className="pl-6 inline-block">{row.area}</span> : row.rowType === "subtotal_area" ? "Area Total" : row.area}
                    </td>
                    <td className="px-3 py-4">
                      {row.rowType === "subtotal_area" && row.date ? (
                        <button
                          type="button"
                          className="font-medium text-foreground"
                          onClick={() => {
                            const key = `${row.date}__${row.area}`;
                            setCollapsedAreas((prev) => {
                              const next = new Set(prev);
                              if (next.has(key)) next.delete(key);
                              else next.add(key);
                              return next;
                            });
                          }}
                        >
                          {collapsedAreas.has(`${row.date}__${row.area}`) ? "▶ " : "▼ "}
                          Area Total
                        </button>
                      ) : row.rowType === "subtotal_date" ? "Date Total" : row.rowType === "detail" ? <span className="pl-6 inline-block">{row.agentName}</span> : row.agentName}
                    </td>
                    <td className="px-3 py-4">
                      {row.rowType === "detail" ? "-" : formatPlannedCount(row.plannedVisits)}
                    </td>
                    <td className="px-3 py-4 font-medium">{row.achievedVisits}</td>
                    <td className="px-3 py-4">{row.rowType === "detail" ? "-" : `${row.visitAchievementRate.toFixed(1)}%`}</td>
                    <td className="px-3 py-4">
                      {row.rowType === "detail" ? "-" : formatPlannedCount(row.plannedConversions)}
                    </td>
                    <td className="px-3 py-4 font-medium">{row.achievedConversions}</td>
                    <td className="px-3 py-4">{row.rowType === "detail" ? "-" : `${row.conversionRate.toFixed(1)}%`}</td>
                    <td className="px-3 py-4">
                      {row.rowType === "detail" ? "-" : formatCurrency(row.plannedSalesValue)}
                    </td>
                    <td className="px-3 py-4 font-medium">{formatCurrency(row.achievedSalesValue)}</td>
                    <td className="px-3 py-4">{row.rowType === "detail" ? "-" : `${row.salesAchievementRate.toFixed(1)}%`}</td>
                    <td className="px-3 py-4">
                      {row.rowType === "detail" ? "-" : formatPlannedCount(row.plannedSamples)}
                    </td>
                    <td className="px-3 py-4 font-medium">{formatPlannedCount(row.achievedSamples)}</td>
                    <td className="px-3 py-4" title={`${row.samplingAchievementRate.toFixed(1)}%`}>
                      {sampleAchievementLabel(row)}
                    </td>
                    <td className="px-3 py-4">{row.posmDeployedOutlets}</td>
                  </tr>
                ))
              )}
            </tbody>
            {totals ? (
              <tfoot className="sticky bottom-0 bg-background">
                <tr className="border-t-2 border-primary bg-primary/10 font-semibold">
                  <td className="px-3 py-3">TOTAL</td>
                  <td className="px-3 py-3">Campaign Total</td>
                  <td className="px-3 py-3">Campaign Total</td>
                  <td className="px-3 py-3">{formatPlannedCount(totals.plannedVisits)}</td>
                  <td className="px-3 py-3">{totals.achievedVisits}</td>
                  <td className="px-3 py-3">{totals.visitAchievementRate.toFixed(1)}%</td>
                  <td className="px-3 py-3">{formatPlannedCount(totals.plannedConversions)}</td>
                  <td className="px-3 py-3">{totals.achievedConversions}</td>
                  <td className="px-3 py-3">{totals.conversionRate.toFixed(1)}%</td>
                  <td className="px-3 py-3">{formatCurrency(totals.plannedSalesValue)}</td>
                  <td className="px-3 py-3">{formatCurrency(totals.achievedSalesValue)}</td>
                  <td className="px-3 py-3">{totals.salesAchievementRate.toFixed(1)}%</td>
                  <td className="px-3 py-3">{formatPlannedCount(totals.plannedSamples)}</td>
                  <td className="px-3 py-3">{formatPlannedCount(totals.achievedSamples)}</td>
                  <td className="px-3 py-3" title={`${totals.samplingAchievementRate.toFixed(1)}%`}>{sampleAchievementLabel(totals)}</td>
                  <td className="px-3 py-3">{totals.posmDeployedOutlets}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, loading = false }: { label: string; value: string; loading?: boolean }) {
  return (
    <div className="rounded-[1.6rem] bg-card p-5 shadow-sm ring-1 ring-border/60">
      <p className="text-xs text-muted-foreground">{label}</p>
      {loading ? <Skeleton className="mt-2 h-9 w-20" /> : <p className="mt-2 text-3xl font-semibold">{value}</p>}
    </div>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(value ?? 0);
}

function formatPlannedCount(value: number) {
  return new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 }).format(Math.round(value));
}

function sampleAchievementLabel(row: PerformanceRow) {
  const planned = Math.round(row.plannedSamples);
  const achieved = Math.round(row.achievedSamples);
  if (planned <= 0) return `${achieved} distributed`;
  if (achieved > planned) return `Exceeded (+${achieved - planned})`;
  if (achieved === planned) return "Target met";
  return `${achieved}/${planned} distributed`;
}
