"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Activity01Icon,
  Alert01Icon,
  Chart01Icon,
  FilterHorizontalIcon,
  Layers01Icon,
  RankingIcon,
  Store01Icon,
  Target01Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTerminology } from "@/components/providers/tenant-experience-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { authorizedFetch } from "@/lib/api/client";

type DateWindow = { dateFrom: string | null; dateTo: string | null; isDefaultWindow: boolean };

function dateWindowNote(window?: DateWindow | null) {
  if (!window) return null;
  if (window.isDefaultWindow) {
    return (
      <p className=" w-max rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
        Showing the last 2 days only (no date range selected) — pick a date range above to see full history.
      </p>
    );
  }
  if (window.dateFrom || window.dateTo) {
    return (
      <p className="rounded-xl bg-primary/10 px-3 py-2 text-xs text-primary font-medium w-max ">
        Showing {window.dateFrom ?? "the beginning"} – {window.dateTo ?? "now"}.
      </p>
    );
  }
  return null;
}

// Types from the existing dashboard API shapes
type DashboardSummary = {
  activeCampaigns: number;
  totalCampaigns: number;
  activeReps: number;
  totalOutlets: number;
  totalVisits: number;
  conversions: number;
  conversionRate: number;
  salesCount: number;
  unitsSold: number;
  salesValue: number;
  syncHealth: number;
  plannedFreeSamples: number;
  distributedFreeSamples: number;
  freeSampleAchievementRate: number;
  posmDeployed: number;
  posmUnits: number;
};

type TrendPoint = { day: string; visits: number; conversions: number };
type RecentActivity = {
  id: string;
  campaignId: string | null;
  rep: string;
  outlet: string;
  status: string;
  time: string;
};
type TerritoryPoint = {
  label: string;
  state: string;
  lga: string;
  visits: number;
  conversions: number;
  rate: number;
};

const VELOCITY_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

export default function CommandCenterDashboard() {
  const t = useTerminology();

  const [showFilters, setShowFilters] = useState(false);
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
    queryKey: ["admin-dashboard-campaigns"],
    queryFn: async () => {
      const result = await authorizedFetch<{ success: boolean; campaigns: Array<{ id: string; name: string }> }>("/api/admin/campaigns?lite=1");
      return result.campaigns ?? [];
    },
  });

  const summaryQuery = useQuery({
    queryKey: ["cc-summary", queryString],
    queryFn: () =>
      authorizedFetch<{ success: boolean; summary: DashboardSummary; appliedDateWindow?: DateWindow }>(
        `/api/admin/dashboard/summary${queryString}`
      ),
  });

  const insightsQuery = useQuery({
    queryKey: ["cc-insights", queryString],
    queryFn: () =>
      authorizedFetch<{
        success: boolean;
        recentActivity: RecentActivity[];
        trend: TrendPoint[];
        territoryPerformance: TerritoryPoint[];
        repPerformance: Array<{ rank: number; repId: string; name: string; visits: number; conversions: number }>;
        pagination: { total: number };
        appliedDateWindow?: DateWindow;
      }>(`/api/admin/dashboard/insights${queryString}${queryString ? "&" : "?"}page=1&pageSize=5`),
  });

  useEffect(() => {
    if (campaignsQuery.error) toast.error((campaignsQuery.error as Error).message);
  }, [campaignsQuery.error]);
  useEffect(() => {
    if (summaryQuery.error) toast.error((summaryQuery.error as Error).message);
  }, [summaryQuery.error]);
  useEffect(() => {
    if (insightsQuery.error) toast.error((insightsQuery.error as Error).message);
  }, [insightsQuery.error]);

  const summary = summaryQuery.data?.summary;
  const appliedDateWindow = summaryQuery.data?.appliedDateWindow ?? insightsQuery.data?.appliedDateWindow ?? null;
  const summaryLoading = summaryQuery.isLoading;
  const insightsLoading = insightsQuery.isLoading;
  const isRefetching =
    !summaryLoading && !insightsLoading && (summaryQuery.isFetching || insightsQuery.isFetching);
  const trend = useMemo(() => insightsQuery.data?.trend ?? [], [insightsQuery.data?.trend]);
  const territory = useMemo(
    () =>
      (insightsQuery.data?.territoryPerformance ?? [])
        .sort((a, b) => b.conversions - a.conversions)
        .slice(0, 7),
    [insightsQuery.data?.territoryPerformance]
  );
  const recentActivity = useMemo(
    () => insightsQuery.data?.recentActivity ?? [],
    [insightsQuery.data?.recentActivity]
  );

  const leaderboard = useMemo(
    () => insightsQuery.data?.repPerformance ?? [],
    [insightsQuery.data?.repPerformance]
  );

  const conversionRate = summary?.conversionRate ?? 0;
  const syncHealth = summary?.syncHealth ?? 100;

  return (
    <div className="flex flex-col gap-5 pb-10">
      {/* ── Page header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Command Center</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Campaign intelligence, activation velocity, and field performance — all in one view.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isRefetching ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />Refreshing…
            </span>
          ) : null}
          <Button variant="outline" className="rounded-full" onClick={() => setShowFilters((value) => !value)}>
            <HugeiconsIcon icon={FilterHorizontalIcon} size={16} />
            {showFilters ? "Hide Filters" : "Filters"}
          </Button>
        </div>
      </div>

      {showFilters ? (
        <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
          <div className="mb-3 flex items-center gap-2">
            <HugeiconsIcon icon={FilterHorizontalIcon} size={16} />
            <h2 className="font-semibold">Filters</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <Select value={campaignId} onValueChange={setCampaignId}>
              <SelectTrigger><SelectValue placeholder={`All ${t("campaigns").toLowerCase()}`} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All {t("campaigns").toLowerCase()}</SelectItem>
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

      {dateWindowNote(appliedDateWindow)}

      {/* ── KPI strip ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          icon={Target01Icon}
          label={`Active ${t("campaigns")}`}
          value={String(summary?.activeCampaigns ?? 0)}
          sub={`of ${summary?.totalCampaigns ?? 0} total`}
          loading={summaryLoading}
          accent
        />
        <KpiCard
          icon={UserGroupIcon}
          label={`Active ${t("agents")}`}
          value={String(summary?.activeReps ?? 0)}
          sub="In the field"
          loading={summaryLoading}
        />
        <KpiCard
          icon={Store01Icon}
          label={`${t("outlets")} covered`}
          value={String(summary?.totalOutlets ?? 0)}
          sub="Unique locations"
          loading={summaryLoading}
        />
        <KpiCard
          icon={Chart01Icon}
          label={`${t("conversion")} rate`}
          value={`${conversionRate.toFixed(1)}%`}
          sub={`${summary?.conversions ?? 0} ${t("conversions").toLowerCase()}`}
          loading={summaryLoading}
        />
      </div>

      {/* ── Row 2: activation velocity + territory leaderboard ── */}
      <div className="grid gap-5 lg:grid-cols-12">
        {/* Activation velocity chart */}
        <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60 lg:col-span-7">
          <div className="mb-4">
            <h2 className="font-semibold">Activation Velocity</h2>
            <p className="text-sm text-muted-foreground">
              {t("visits")} vs {t("conversions")}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4 mb-5">
            <VelocityMini label={`Total ${t("visits").toLowerCase()}`} value={String(summary?.totalVisits ?? 0)} loading={summaryLoading} />
            <VelocityMini label={t("conversions")} value={String(summary?.conversions ?? 0)} loading={summaryLoading} />
            <VelocityMini label="Units sold" value={String(summary?.unitsSold ?? 0)} loading={summaryLoading} />
          </div>
          <div className="h-52 rounded-3xl bg-background p-4">
            {insightsLoading ? (
              <Skeleton className="h-full w-full rounded-2xl" />
            ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend}>
                <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="4 4" />
                <XAxis
                  dataKey="day"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                  allowDecimals={false}
                  width={32}
                />
                <Tooltip cursor={false} />
                <Legend
                  iconType="circle"
                  wrapperStyle={{ fontSize: 12 }}
                />
                <Area
                  type="monotone"
                  dataKey="visits"
                  stroke="var(--color-chart-1)"
                  strokeWidth={2}
                  fill="var(--color-chart-1)"
                  fillOpacity={0.15}
                  name={t("visits")}
                />
                <Area
                  type="monotone"
                  dataKey="conversions"
                  stroke="var(--color-chart-5)"
                  strokeWidth={2}
                  fill="var(--color-chart-5)"
                  fillOpacity={0.1}
                  name={t("conversions")}
                />
              </AreaChart>
            </ResponsiveContainer>
            )}
          </div>
        </section>

        {/* Territory performance bar */}
        <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60 lg:col-span-5">
          <div className="mb-4">
            <h2 className="font-semibold">Top Territories</h2>
            <p className="text-sm text-muted-foreground">By {t("conversions").toLowerCase()}</p>
          </div>
          {insightsLoading ? (
            <div className="h-52 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full rounded-xl" />
              ))}
            </div>
          ) : territory.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
              No territory data yet.
            </div>
          ) : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={territory} layout="vertical">
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={80}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                  />
                  <Tooltip cursor={false} />
                  <Bar dataKey="conversions" radius={[0, 8, 8, 0]} name={t("conversions")}>
                    {territory.map((_, i) => (
                      <Cell key={i} fill={VELOCITY_COLORS[i % VELOCITY_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>

      {/* ── Row 3: field officer leaderboard + system health + live stream ── */}
      <div className="grid gap-5 lg:grid-cols-12">
        {/* Leaderboard */}
        <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60 lg:col-span-4">
          <div className="mb-4 flex items-center gap-2">
            <HugeiconsIcon icon={RankingIcon} size={17} strokeWidth={1.8} className="text-primary" />
            <h2 className="font-semibold">{t("agent")} Leaderboard</h2>
          </div>
          {insightsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-2xl" />
              ))}
            </div>
          ) : leaderboard.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity data yet.</p>
          ) : (
            <ol className="space-y-2">
              {leaderboard.map((entry) => (
                <li
                  key={entry.rank}
                  className="flex items-center gap-3 rounded-2xl bg-background px-4 py-3"
                >
                  <span
                    className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                      entry.rank === 1
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {entry.rank}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {entry.name}
                  </span>
                  <span className="text-sm font-semibold text-primary">
                    {entry.visits}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* System health mini-cards */}
        <section className="flex flex-col gap-3 lg:col-span-4">
          <HealthCard
            icon={Layers01Icon}
            label="Field sync health"
            value={`${syncHealth.toFixed(1)}%`}
            ok={syncHealth >= 90}
            loading={summaryLoading}
          />
          <HealthCard
            icon={Activity01Icon}
            label={`${t("freeSample")} achievement`}
            value={`${(summary?.freeSampleAchievementRate ?? 0).toFixed(1)}%`}
            ok={(summary?.freeSampleAchievementRate ?? 0) >= 70}
            loading={summaryLoading}
          />
          <HealthCard
            icon={Alert01Icon}
            label="POSM deployed"
            value={`${summary?.posmDeployed ?? 0} / ${summary?.posmUnits ?? 0}`}
            ok={(summary?.posmDeployed ?? 0) >= (summary?.posmUnits ?? 1) * 0.7}
            loading={summaryLoading}
          />
        </section>

        {/* Live activity stream */}
        <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60 lg:col-span-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">Live Activity</h2>
            <Link
              href="/admin/campaigns"
              className="text-xs font-medium text-primary hover:underline"
            >
              All campaigns
            </Link>
          </div>
          {insightsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-2xl" />
              ))}
            </div>
          ) : recentActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <ul className="space-y-2">
              {recentActivity.slice(0, 5).map((item) => {
                const rowClassName = "flex items-start gap-3 rounded-2xl bg-background px-4 py-3 transition-colors hover:bg-muted/40";
                const rowContent = (
                  <>
                    <span
                      className={`mt-0.5 size-2 shrink-0 rounded-full ${
                        item.status.toLowerCase() === "converted"
                          ? "bg-primary"
                          : "bg-muted-foreground/50"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.rep}</p>
                      <p className="truncate text-xs text-muted-foreground">{item.outlet}</p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {new Date(item.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </>
                );
                return (
                  <li key={item.id}>
                    {item.campaignId ? (
                      <Link href={`/admin/campaigns/${item.campaignId}/activities/${item.id}`} className={rowClassName}>
                        {rowContent}
                      </Link>
                    ) : (
                      <div className={rowClassName}>{rowContent}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

// ---- sub-components ----

function KpiCard({
  icon,
  label,
  value,
  sub,
  accent = false,
  loading = false,
}: {
  icon: unknown;
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
  loading?: boolean;
}) {
  return (
    <div
      className={`rounded-[1.8rem] p-5 shadow-sm ring-1 ${
        accent
          ? "bg-primary text-primary-foreground ring-primary/40"
          : "bg-card ring-border/60"
      }`}
    >
      <span
        className={`grid size-10 place-items-center rounded-full ${
          accent ? "bg-white/20" : "bg-muted"
        }`}
      >
        <HugeiconsIcon icon={icon as never} size={18} strokeWidth={1.8} />
      </span>
      <p className={`mt-4 text-xs ${accent ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
        {label}
      </p>
      {loading ? (
        <Skeleton className={`mt-2 h-8 w-16 ${accent ? "bg-white/20" : ""}`} />
      ) : (
        <p className="mt-1 text-3xl font-semibold tracking-tight">{value}</p>
      )}
      <p className={`mt-1 text-xs ${accent ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
        {loading ? " " : sub}
      </p>
    </div>
  );
}

function VelocityMini({ label, value, loading = false }: { label: string; value: string; loading?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      {loading ? <Skeleton className="mt-1.5 h-6 w-12" /> : <p className="mt-1 text-xl font-semibold">{value}</p>}
    </div>
  );
}

function HealthCard({
  icon,
  label,
  value,
  ok,
  loading = false,
}: {
  icon: unknown;
  label: string;
  value: string;
  ok: boolean;
  loading?: boolean;
}) {
  return (
    <div className="flex flex-1 items-center gap-4 rounded-3xl bg-card p-4 shadow-sm ring-1 ring-border/60">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted">
        <HugeiconsIcon icon={icon as never} size={18} strokeWidth={1.8} />
      </span>
      <div className="flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        {loading ? <Skeleton className="mt-1 h-5 w-20" /> : <p className="mt-0.5 text-lg font-semibold">{value}</p>}
      </div>
      {loading ? null : (
        <span
          className={`size-2.5 shrink-0 rounded-full ${ok ? "bg-primary" : "bg-destructive/70"}`}
        />
      )}
    </div>
  );
}
