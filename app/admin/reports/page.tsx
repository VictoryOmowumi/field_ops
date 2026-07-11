"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
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
import { useTerminology } from "@/components/providers/tenant-experience-provider";

type Overview = {
  totalVisits: number;
  conversions: number;
  conversionRate: number;
  salesValue: number;
};

type PerfRow = {
  rep: string;
  territory: string;
  visits: number;
  conversions: number;
  salesValue: number;
  rate: number;
};

export default function ReportsPage() {
  const t = useTerminology();
  const [campaignId, setCampaignId] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [repPage, setRepPage] = useState(1);
  const [productPage, setProductPage] = useState(1);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (campaignId !== "all") params.set("campaignId", campaignId);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    const str = params.toString();
    return str ? `?${str}` : "";
  }, [campaignId, dateFrom, dateTo]);

  // Reset pagination when the filters change — adjusted during render (React's recommended
  // pattern for this) rather than in a useEffect, which would commit a render with stale page
  // numbers first and only fix it a tick later.
  const [prevQueryString, setPrevQueryString] = useState(queryString);
  if (queryString !== prevQueryString) {
    setPrevQueryString(queryString);
    setRepPage(1);
    setProductPage(1);
  }

  const campaignsQuery = useQuery({
    queryKey: ["admin-reports-campaigns"],
    queryFn: async () => {
      const result = await authorizedFetch<{ success: boolean; campaigns: Array<{ id: string; name: string }> }>("/api/admin/campaigns");
      return result.campaigns ?? [];
    },
  });

  const overviewQuery = useQuery({
    queryKey: ["admin-reports-overview", queryString],
    queryFn: async () => {
      const result = await authorizedFetch<{ success: boolean; overview: Overview }>(`/api/admin/reports/overview${queryString}`);
      return result.overview;
    },
  });
  const overviewDetailsQuery = useQuery({
    queryKey: ["admin-reports-overview-details", queryString, productPage],
    queryFn: async () =>
      authorizedFetch<{
        success: boolean;
        trend: Array<{ day: string; visits: number; conversions: number }>;
        products: Array<{ product: string; value: number }>;
        productPagination: { page: number; pageSize: number; total: number; hasMore: boolean };
      }>(`/api/admin/reports/overview/details${queryString}${queryString ? "&" : "?"}productPage=${productPage}&productPageSize=10`),
  });

  const performanceQuery = useQuery({
    queryKey: ["admin-reports-performance", queryString, repPage],
    queryFn: async () => {
      const result = await authorizedFetch<{
        success: boolean;
        performance: PerfRow[];
        page: number;
        pageSize: number;
        total: number;
        hasMore: boolean;
      }>(`/api/admin/reports/rep-performance${queryString}${queryString ? "&" : "?"}page=${repPage}&pageSize=20`);
      return result;
    },
  });

  if (campaignsQuery.error) toast.error((campaignsQuery.error as Error).message);
  if (overviewQuery.error) toast.error((overviewQuery.error as Error).message);
  if (overviewDetailsQuery.error) toast.error((overviewDetailsQuery.error as Error).message);
  if (performanceQuery.error) toast.error((performanceQuery.error as Error).message);

  const overview = overviewQuery.data;
  const products = overviewDetailsQuery.data?.products ?? [];
  const productPagination = overviewDetailsQuery.data?.productPagination;
  const performanceRows = performanceQuery.data?.performance ?? [];
  const [exporting, setExporting] = useState<"rep" | "activities" | null>(null);

  async function downloadExport(type: "rep-performance" | "campaign-activities") {
    // campaign-activities is a per-visit/per-activity CSV (task_payload per row),
    // not an aggregate — this campaign alone runs ~2,000 visits/day, so it needs
    // a bounded range chosen up front rather than relying on a server default.
    if (type === "campaign-activities" && (!dateFrom || !dateTo)) {
      toast.error("Pick a date range before exporting activities — this report is too large to export without one.");
      return;
    }
    setExporting(type === "rep-performance" ? "rep" : "activities");
    try {
      const { data } = await supabaseClient.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Session expired. Please sign in again.");
      const response = await fetch(`/api/admin/reports/export?type=${type}${queryString ? `&${queryString.slice(1)}` : ""}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? "Failed to export report.");
      }
      const blob = await response.blob();
      const fileName = type === "rep-performance" ? "rep-performance.csv" : "campaign-activities.csv";
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Export downloaded.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">Review {t("campaign").toLowerCase()} performance, product movement, and {t("agent").toLowerCase()} productivity.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="rounded-full px-5">
            <Link href="/admin/reports/performance">Open KPI Performance</Link>
          </Button>
          <Button className="rounded-full px-5" disabled={exporting !== null} onClick={() => void downloadExport("rep-performance")}>
            {exporting === "rep" ? "Exporting..." : "Export Rep CSV"}
          </Button>
          <Button variant="outline" className="rounded-full px-5" disabled={exporting !== null} onClick={() => void downloadExport("campaign-activities")}>
            {exporting === "activities" ? "Exporting..." : "Export Activities CSV"}
          </Button>
        </div>
      </div>

      <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <h2 className="font-medium">Filters</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div>
            <p className="mb-1 text-xs text-muted-foreground">{t("campaign")}</p>
            <Select value={campaignId} onValueChange={setCampaignId}>
              <SelectTrigger>
                <SelectValue placeholder={`All ${t("campaigns").toLowerCase()}`} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All {t("campaigns").toLowerCase()}</SelectItem>
                {(campaignsQuery.data ?? []).map((campaign) => (
                  <SelectItem key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </SelectItem>
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
              }}
            >
              Clear Filters
            </Button>
          </div>
        </div>
      </section>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={`Total ${t("visits").toLowerCase()}`} value={overview ? `${overview.totalVisits}` : "-"} loading={overviewQuery.isLoading} />
        <Stat label={t("conversions")} value={overview ? `${overview.conversions}` : "-"} loading={overviewQuery.isLoading} />
        <Stat label={`${t("conversion")} rate`} value={overview ? `${overview.conversionRate.toFixed(1)}%` : "-"} loading={overviewQuery.isLoading} />
        <Stat label="Sales value" value={overview ? formatCurrency(overview.salesValue) : "-"} loading={overviewQuery.isLoading} />
      </div>

      <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <h2 className="font-medium">Product Performance</h2>
        <p className="mt-1 text-sm text-muted-foreground">Top products by recorded quantity.</p>
        <div className="mt-4 overflow-hidden rounded-3xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Product</th>
                <th className="px-4 py-3 text-left">Quantity</th>
              </tr>
            </thead>
            <tbody>
              {overviewQuery.isLoading ? (
                <TableLoadingState colSpan={2} title="Loading product performance..." description="Computing product totals." />
              ) : products.length === 0 ? (
                <TableEmptyStateRow colSpan={2} title="No product data" description="No sales records yet." />
              ) : (
                products.map((item) => (
                  <tr key={item.product} className="border-t border-border">
                    <td className="px-4 py-4 font-medium">{item.product}</td>
                    <td className="px-4 py-4 text-muted-foreground">{item.value}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center justify-end gap-2">
          <Button variant="outline" className="rounded-full" disabled={(productPagination?.page ?? 1) <= 1} onClick={() => setProductPage((prev) => Math.max(1, prev - 1))}>Previous</Button>
          <Button variant="outline" className="rounded-full" disabled={!productPagination?.hasMore} onClick={() => setProductPage((prev) => prev + 1)}>Next</Button>
        </div>
      </section>

      <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <h2 className="font-medium">{t("agent")} Performance Report</h2>
        <p className="mt-1 text-sm text-muted-foreground">Export-ready summary of field {t("agent").toLowerCase()} performance.</p>

        <div className="mt-4 overflow-hidden rounded-3xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">{t("agent")}</th>
                <th className="px-4 py-3 text-left">Territory</th>
                <th className="px-4 py-3 text-left">{t("visits")}</th>
                <th className="px-4 py-3 text-left">{t("conversions")}</th>
                <th className="px-4 py-3 text-left">Sales Value</th>
                <th className="px-4 py-3 text-left">Rate</th>
              </tr>
            </thead>
            <tbody>
              {performanceQuery.isLoading ? (
                <TableLoadingState colSpan={6} title={`Loading ${t("agent").toLowerCase()} performance...`} description={`Computing ${t("agent").toLowerCase()} ${t("conversion").toLowerCase()} metrics.`} />
              ) : performanceRows.length === 0 ? (
                <TableEmptyStateRow colSpan={6} title={`No ${t("agent").toLowerCase()} metrics yet`} description={`${t("agent")} performance will appear after activity is recorded.`} />
              ) : (
                performanceRows.map((item) => (
                  <tr key={`${item.rep}-${item.territory}`} className="border-t border-border">
                    <td className="px-4 py-4 font-medium">{item.rep}</td>
                    <td className="px-4 py-4 text-muted-foreground">{item.territory || "-"}</td>
                    <td className="px-4 py-4 font-medium">{item.visits}</td>
                    <td className="px-4 py-4 font-medium">{item.conversions}</td>
                    <td className="px-4 py-4 font-medium">{formatCurrency(item.salesValue)}</td>
                    <td className="px-4 py-4 text-primary">{item.rate.toFixed(1)}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center justify-end gap-2">
          <Button variant="outline" className="rounded-full" disabled={(performanceQuery.data?.page ?? 1) <= 1} onClick={() => setRepPage((prev) => Math.max(1, prev - 1))}>Previous</Button>
          <Button variant="outline" className="rounded-full" disabled={!performanceQuery.data?.hasMore} onClick={() => setRepPage((prev) => prev + 1)}>Next</Button>
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
