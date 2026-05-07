"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import TableEmptyStateRow from "@/components/shared/TableEmptyStateRow";
import TableLoadingState from "@/components/shared/TableLoadingState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { authorizedFetch } from "@/lib/api/client";
import { supabaseClient } from "@/lib/supabase/client";

type Overview = {
  totalVisits: number;
  conversions: number;
  conversionRate: number;
  salesValue: number;
  trend: Array<{ day: string; visits: number; conversions: number }>;
  products: Array<{ product: string; value: number }>;
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
  const [campaignId, setCampaignId] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (campaignId !== "all") params.set("campaignId", campaignId);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    const str = params.toString();
    return str ? `?${str}` : "";
  }, [campaignId, dateFrom, dateTo]);

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

  const performanceQuery = useQuery({
    queryKey: ["admin-reports-performance", queryString],
    queryFn: async () => {
      const result = await authorizedFetch<{ success: boolean; performance: PerfRow[] }>(`/api/admin/reports/rep-performance${queryString}`);
      return result.performance ?? [];
    },
  });

  if (campaignsQuery.error) toast.error((campaignsQuery.error as Error).message);
  if (overviewQuery.error) toast.error((overviewQuery.error as Error).message);
  if (performanceQuery.error) toast.error((performanceQuery.error as Error).message);

  const overview = overviewQuery.data;
  const [exporting, setExporting] = useState<"rep" | "activities" | null>(null);

  async function downloadExport(type: "rep-performance" | "campaign-activities") {
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
          <p className="mt-1 text-sm text-muted-foreground">Review campaign performance, product movement, and rep productivity.</p>
        </div>
        <div className="flex flex-wrap gap-2">
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
            <p className="mb-1 text-xs text-muted-foreground">Campaign</p>
            <Select value={campaignId} onValueChange={setCampaignId}>
              <SelectTrigger>
                <SelectValue placeholder="All campaigns" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All campaigns</SelectItem>
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
        <Stat label="Total visits" value={overview ? `${overview.totalVisits}` : "-"} />
        <Stat label="Conversions" value={overview ? `${overview.conversions}` : "-"} />
        <Stat label="Conversion rate" value={overview ? `${overview.conversionRate.toFixed(1)}%` : "-"} />
        <Stat label="Sales value" value={overview ? formatCurrency(overview.salesValue) : "-"} />
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
              ) : (overview?.products ?? []).length === 0 ? (
                <TableEmptyStateRow colSpan={2} title="No product data" description="No sales records yet." />
              ) : (
                (overview?.products ?? []).map((item) => (
                  <tr key={item.product} className="border-t border-border">
                    <td className="px-4 py-4 font-medium">{item.product}</td>
                    <td className="px-4 py-4 text-muted-foreground">{item.value}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <h2 className="font-medium">Rep Performance Report</h2>
        <p className="mt-1 text-sm text-muted-foreground">Export-ready summary of field agent performance.</p>

        <div className="mt-4 overflow-hidden rounded-3xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Rep</th>
                <th className="px-4 py-3 text-left">Territory</th>
                <th className="px-4 py-3 text-left">Visits</th>
                <th className="px-4 py-3 text-left">Conversions</th>
                <th className="px-4 py-3 text-left">Sales Value</th>
                <th className="px-4 py-3 text-left">Rate</th>
              </tr>
            </thead>
            <tbody>
              {performanceQuery.isLoading ? (
                <TableLoadingState colSpan={6} title="Loading rep performance..." description="Computing rep conversion metrics." />
              ) : (performanceQuery.data ?? []).length === 0 ? (
                <TableEmptyStateRow colSpan={6} title="No rep metrics yet" description="Rep performance will appear after activity is recorded." />
              ) : (
                (performanceQuery.data ?? []).map((item) => (
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
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.6rem] bg-card p-5 shadow-sm ring-1 ring-border/60">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </div>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(value ?? 0);
}
