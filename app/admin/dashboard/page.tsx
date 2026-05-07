"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert01Icon, Chart01Icon, CloudUploadIcon, FilterHorizontalIcon, Store01Icon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { Area, AreaChart, Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";

import TerritoryPerformanceMap from "@/components/admin/TerritoryPerformanceMap";
import TableEmptyStateRow from "@/components/shared/TableEmptyStateRow";
import TableLoadingState from "@/components/shared/TableLoadingState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { authorizedFetch } from "@/lib/api/client";

type DashboardSummary = {
  activeCampaigns: number;
  totalCampaigns: number;
  activeReps: number;
  totalOutlets: number;
  totalSalesRecords: number;
  conversions: number;
  conversionRate: number;
  salesValue: number;
  syncHealth: number;
};

type RecentActivity = { id: string; rep: string; outlet: string; status: string; time: string };
type TrendPoint = { day: string; visits: number; conversions: number };
type TerritoryPoint = {
  label: string;
  state: string;
  lga: string;
  visits: number;
  conversions: number;
  rate: number;
  latitude: number;
  longitude: number;
};

export default function AdminDashboardPage() {
  const [showFilters, setShowFilters] = useState(false);
  const [campaignId, setCampaignId] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [territoryStateFilter, setTerritoryStateFilter] = useState("all");

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (campaignId !== "all") params.set("campaignId", campaignId);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    const str = params.toString();
    return str ? `?${str}` : "";
  }, [campaignId, dateFrom, dateTo]);

  const campaignsQuery = useQuery({
    queryKey: ["admin-dashboard-campaigns"],
    queryFn: async () => {
      const result = await authorizedFetch<{ success: boolean; campaigns: Array<{ id: string; name: string }> }>("/api/admin/campaigns");
      return result.campaigns ?? [];
    },
  });

  const query = useQuery({
    queryKey: ["admin-dashboard-summary", queryString],
    queryFn: async () =>
      authorizedFetch<{
        success: boolean;
        summary: DashboardSummary;
        recentActivity: RecentActivity[];
        trend: TrendPoint[];
        territoryPerformance: TerritoryPoint[];
      }>(`/api/admin/dashboard/summary${queryString}`),
  });

  if (campaignsQuery.error) toast.error((campaignsQuery.error as Error).message);
  if (query.error) toast.error((query.error as Error).message);

  const summary = query.data?.summary;
  const trend = query.data?.trend ?? [];
  const territoryPerformance = query.data?.territoryPerformance ?? [];
  const stateOptions = useMemo(
    () => ["all", ...Array.from(new Set(territoryPerformance.map((item) => item.state).filter(Boolean))).sort((a, b) => a.localeCompare(b))],
    [territoryPerformance]
  );
  const filteredTerritoryPerformance = useMemo(
    () =>
      territoryStateFilter === "all"
        ? territoryPerformance
        : territoryPerformance.filter((item) => item.state === territoryStateFilter),
    [territoryPerformance, territoryStateFilter]
  );
  const pendingUploads = Math.max(0, (summary?.totalSalesRecords ?? 0) - Math.round(((summary?.syncHealth ?? 100) / 100) * (summary?.totalSalesRecords ?? 0)));

  return (
    <div className="flex flex-col gap-6 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Live campaign operations, conversion coverage, and field activity.</p>
        </div>
        <Button variant="outline" className="rounded-full" onClick={() => setShowFilters((value) => !value)}>
          <HugeiconsIcon icon={FilterHorizontalIcon} size={16} />
          {showFilters ? "Hide Filters" : "Filters"}
        </Button>
      </div>

      {showFilters ? (
        <section className="rounded-[2rem] bg-card p-5 shadow-sm ring-1 ring-border/60">
          <div className="mb-3 flex items-center gap-2">
            <HugeiconsIcon icon={FilterHorizontalIcon} size={16} />
            <h2 className="font-semibold">Filters</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <Select value={campaignId} onValueChange={setCampaignId}>
              <SelectTrigger><SelectValue placeholder="All campaigns" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All campaigns</SelectItem>
                {(campaignsQuery.data ?? []).map((campaign) => (
                  <SelectItem key={campaign.id} value={campaign.id}>{campaign.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => {
                setCampaignId("all");
                setDateFrom("");
                setDateTo("");
              }}
            >
              Clear
            </Button>
          </div>
        </section>
      ) : null}

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="rounded-[2rem] bg-card p-5 shadow-sm ring-1 ring-border/60 lg:col-span-5">
          <h2 className="font-semibold">Visit Trend</h2>
          <p className="text-sm text-muted-foreground">Last 7 days visits and conversions.</p>
          <div className="mt-4 mb-5 grid grid-cols-2 gap-4">
            <MetricMini label="Total visits" value={String(summary?.totalSalesRecords ?? 0)} trend="Live" />
            <MetricMini label="Conversions" value={String(summary?.conversions ?? 0)} trend={`${summary?.conversionRate.toFixed(1) ?? "0"}%`} />
          </div>
          <div className="h-52 rounded-[1.5rem] bg-background p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend}>
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }} />
                <Tooltip cursor={false} />
                <Bar dataKey="visits" radius={[12, 12, 0, 0]} fill="var(--color-chart-1)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-[2rem] bg-card p-5 shadow-sm ring-1 ring-border/60 lg:col-span-7">
          <h2 className="font-semibold">Operational Health</h2>
          <p className="text-sm text-muted-foreground">Core data points from filtered records.</p>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            <InsightCard icon={UserGroupIcon} title="Active reps" value={String(summary?.activeReps ?? 0)} data={trend} dataKey="visits" />
            <InsightCard icon={Store01Icon} title="Outlets covered" value={String(summary?.totalOutlets ?? 0)} data={trend} dataKey="conversions" />
            <DarkInsightCard failedUploads={pendingUploads} data={trend} />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:col-span-5">
          <SmallStat icon={Chart01Icon} label="Conversion rate" value={`${summary?.conversionRate.toFixed(1) ?? "0"}%`} trend="Live" />
          <SmallStat icon={CloudUploadIcon} label="Field sync health" value={`${summary?.syncHealth.toFixed(1) ?? "100"}%`} trend="Live" />
          <SmallStat icon={Alert01Icon} label="Pending uploads" value={String(pendingUploads)} trend="Derived" />
          <SmallStat icon={Store01Icon} label="Active campaigns" value={String(summary?.activeCampaigns ?? 0)} trend={`${summary?.totalCampaigns ?? 0} total`} />
        </div>

        <div className="rounded-[2rem] bg-card p-5 shadow-sm ring-1 ring-border/60 lg:col-span-7">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">City Performance</h2>
              <p className="text-sm text-muted-foreground">Conversion rate by territory (map coverage).</p>
            </div>
            <Select value={territoryStateFilter} onValueChange={setTerritoryStateFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All states" />
              </SelectTrigger>
              <SelectContent>
                {stateOptions.map((stateName) => (
                  <SelectItem key={stateName} value={stateName}>
                    {stateName === "all" ? "All states" : stateName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="mt-4">
            {filteredTerritoryPerformance.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                No territory geodata for selected state/filter.
              </div>
            ) : (
              <TerritoryPerformanceMap points={filteredTerritoryPerformance} />
            )}
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] bg-card p-5 shadow-sm ring-1 ring-border/60">
        <h2 className="font-semibold">Recent Field Activity</h2>
        <p className="text-sm text-muted-foreground">Latest submissions from sales reps.</p>
        <div className="mt-4 overflow-hidden rounded-[1.5rem] border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Rep</th>
                <th className="px-4 py-3 text-left font-medium">Outlet</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {query.isLoading ? (
                <TableLoadingState colSpan={4} title="Loading activity..." description="Fetching latest submissions." />
              ) : (query.data?.recentActivity ?? []).length === 0 ? (
                <TableEmptyStateRow colSpan={4} title="No recent activity" description="Field activity will appear here after submissions." />
              ) : (
                (query.data?.recentActivity ?? []).map((item) => (
                  <tr key={item.id} className="border-t border-border">
                    <td className="px-4 py-4 font-medium">{item.rep}</td>
                    <td className="px-4 py-4 text-muted-foreground">{item.outlet}</td>
                    <td className="px-4 py-4"><StatusBadge status={item.status} /></td>
                    <td className="px-4 py-4 text-muted-foreground">{new Date(item.time).toLocaleString()}</td>
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

function MetricMini({ label, value, trend }: { label: string; value: string; trend: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <p className="text-2xl font-semibold">{value}</p>
        <span className="text-xs text-primary">{trend}</span>
      </div>
    </div>
  );
}

function InsightCard({ icon, title, value, data, dataKey }: { icon: unknown; title: string; value: string; data: TrendPoint[]; dataKey: "visits" | "conversions" }) {
  return (
    <div className="rounded-[1.6rem] bg-background p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="grid size-9 place-items-center rounded-full bg-muted">
          <HugeiconsIcon icon={icon as never} size={17} />
        </span>
        <p className="font-medium">{title}</p>
      </div>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      <div className="mt-4 h-20">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <Area type="monotone" dataKey={dataKey} stroke="var(--color-chart-1)" strokeWidth={2} fill="var(--color-chart-1)" fillOpacity={0.18} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function DarkInsightCard({ failedUploads, data }: { failedUploads: number; data: TrendPoint[] }) {
  return (
    <div className="rounded-[1.6rem] bg-foreground p-5 text-background">
      <div className="mb-4 flex items-center gap-2">
        <span className="grid size-9 place-items-center rounded-full bg-background/10">
          <HugeiconsIcon icon={Alert01Icon} size={17} />
        </span>
        <p className="font-medium">Failed uploads</p>
      </div>
      <p className="mt-1 text-2xl font-semibold">{failedUploads}</p>
      <div className="mt-4 h-20">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <Area type="monotone" dataKey="conversions" stroke="var(--color-chart-1)" strokeWidth={2} fill="var(--color-chart-1)" fillOpacity={0.25} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function SmallStat({ icon, label, value, trend }: { icon: unknown; label: string; value: string; trend: string }) {
  return (
    <div className="rounded-[1.6rem] bg-card p-5 shadow-sm ring-1 ring-border/60">
      <span className="grid size-10 place-items-center rounded-full bg-muted">
        <HugeiconsIcon icon={icon as never} size={18} />
      </span>
      <p className="mt-5 text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-center justify-between">
        <p className="text-2xl font-semibold">{value}</p>
        <span className="text-xs text-primary">{trend}</span>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const className = normalized === "converted" ? "bg-primary/10 text-primary" : normalized === "pending" ? "bg-muted text-muted-foreground" : "bg-secondary text-secondary-foreground";
  return <span className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${className}`}>{status}</span>;
}
