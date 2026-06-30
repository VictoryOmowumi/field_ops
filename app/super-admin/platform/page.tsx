"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { authorizedFetch } from "@/lib/api/client";
import type { PlatformMonitoringSummary } from "@/types/platform";

type Tone = "green" | "yellow" | "red" | "gray";

const TONE_DOT: Record<Tone, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-destructive",
  gray: "bg-muted-foreground/40",
};

const TONE_TEXT: Record<Tone, string> = {
  green: "text-emerald-600",
  yellow: "text-amber-600",
  red: "text-destructive",
  gray: "text-muted-foreground",
};

function latencyTone(ms: number | undefined): Tone {
  if (ms === undefined) return "gray";
  if (ms < 500) return "green";
  if (ms < 1500) return "yellow";
  return "red";
}

function statusTone(status: string): Tone {
  if (status === "healthy" || status === "configured") return "green";
  if (status === "unhealthy") return "red";
  return "gray";
}

type HealthPing = { status: string; latencyMs?: number };

function useLivePing(path: string) {
  return useQuery({
    queryKey: ["platform-live-health", path],
    queryFn: async () => {
      const response = await fetch(path);
      return (await response.json()) as HealthPing;
    },
    refetchInterval: 60_000,
  });
}

export default function SuperAdminPlatformPage() {
  const summaryQuery = useQuery({
    queryKey: ["platform-monitoring-summary"],
    queryFn: async () =>
      authorizedFetch<{ success: boolean; summary: PlatformMonitoringSummary }>("/api/platform/monitoring/summary"),
  });

  const apiPing = useLivePing("/api/health");
  const dbPing = useLivePing("/api/health/db");
  const storagePing = useLivePing("/api/health/storage");

  const summary = summaryQuery.data?.summary;
  const summaryLoading = summaryQuery.isLoading;

  const overallTone: Tone = useMemo(() => {
    if (!summary) return "gray";
    const hasCritical = summary.alerts.some((a) => a.severity === "critical");
    const infraDown = summary.infrastructure.database.status === "unhealthy" || summary.infrastructure.storage.status === "unhealthy";
    if (hasCritical || infraDown) return "red";
    if (summary.alerts.length > 0) return "yellow";
    return "green";
  }, [summary]);

  const lastChecked = summary ? new Date(summary.generatedAt).toUTCString().slice(17, 22) : "--:--";

  return (
    <div className="flex flex-col gap-6 pb-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Platform</h1>
        <p className="mt-1 text-sm text-muted-foreground">Live operational status across infrastructure, auth, and campaign activity.</p>
      </div>

      <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <div className="flex items-center gap-3">
          <span className={`size-3 rounded-full ${TONE_DOT[overallTone]}`} />
          <p className="text-lg font-semibold">
            Platform Status: <span className={TONE_TEXT[overallTone]}>{overallTone === "green" ? "Healthy" : overallTone === "yellow" ? "Degraded" : overallTone === "red" ? "Critical" : "Checking..."}</span>
          </p>
          <p className="ml-auto text-sm text-muted-foreground">Last checked {lastChecked} UTC</p>
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Infrastructure</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <InfraCard label="Database" status={summary?.infrastructure.database.status ?? "checking"} latencyMs={summary?.infrastructure.database.latencyMs} loading={summaryLoading} />
          <InfraCard label="Storage" status={summary?.infrastructure.storage.status ?? "checking"} latencyMs={summary?.infrastructure.storage.latencyMs} loading={summaryLoading} />
          <InfraCard label="API" status={summary?.infrastructure.api.status ?? "checking"} latencyMs={summary?.infrastructure.api.latencyMs} loading={summaryLoading} />
          <InfraCard label="Sentry" status={summary?.infrastructure.sentry.status ?? "checking"} loading={summaryLoading} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Activity (24h)</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <ActivityCard label="Submissions today" value={summary?.activity.submissionsToday ?? 0} series={summary?.activity.submissionsSparkline} loading={summaryLoading} />
          <ActivityCard label="Photos uploaded" value={summary?.activity.photosUploadedToday ?? 0} series={summary?.activity.photosSparkline} loading={summaryLoading} />
          <ActivityCard label="Active reps" value={summary?.activity.activeRepsToday ?? 0} series={summary?.activity.activeRepsSparkline} loading={summaryLoading} />
          <ActivityCard label="Failed logins" value={summary?.activity.failedLoginsToday ?? 0} series={summary?.activity.failedLoginsSparkline} loading={summaryLoading} />
          <ActivityCard label="Upload failures" value={summary?.activity.uploadFailuresToday ?? 0} series={summary?.activity.uploadFailuresSparkline} loading={summaryLoading} />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60 lg:col-span-7">
          <h2 className="font-semibold">Errors</h2>
          <p className="text-sm text-muted-foreground">Latest system events.</p>
          <div className="mt-4 overflow-hidden rounded-3xl border border-border">
            <div className="max-h-[420px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Time</th>
                    <th className="px-4 py-3 text-left font-medium">Severity</th>
                    <th className="px-4 py-3 text-left font-medium">Event</th>
                    <th className="px-4 py-3 text-left font-medium">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-4 py-3" colSpan={4}><Skeleton className="h-5 w-full" /></td>
                      </tr>
                    ))
                  ) : (
                    <>
                      {(summary?.errors ?? []).map((event) => (
                        <tr key={event.id} className="border-t border-border">
                          <td className="px-4 py-3 text-muted-foreground">{new Date(event.createdAt).toUTCString().slice(17, 22)}</td>
                          <td className="px-4 py-3"><SeverityBadge severity={event.severity} /></td>
                          <td className="px-4 py-3 font-medium">{event.eventType}</td>
                          <td className="px-4 py-3 text-muted-foreground">{event.message}</td>
                        </tr>
                      ))}
                      {summaryQuery.isSuccess && (summary?.errors.length ?? 0) === 0 ? (
                        <tr className="border-t border-border"><td className="px-4 py-4 text-muted-foreground" colSpan={4}>No recent events.</td></tr>
                      ) : null}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60 lg:col-span-5">
          <h2 className="font-semibold">Alerts</h2>
          <p className="text-sm text-muted-foreground">Currently active conditions.</p>
          <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto">
            {summaryLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-3xl" />)
            ) : (
              <>
                {(summary?.alerts ?? []).map((alert) => (
                  <div key={alert.alertKey} className="rounded-3xl bg-muted/35 p-4">
                    <div className="flex items-center gap-2">
                      <SeverityBadge severity={alert.severity} />
                      <p className="font-medium">{alert.subject}</p>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{alert.message}</p>
                  </div>
                ))}
                {summaryQuery.isSuccess && (summary?.alerts.length ?? 0) === 0 ? (
                  <div className="rounded-3xl bg-muted/35 p-4 text-sm text-muted-foreground">No active alerts.</div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <h2 className="font-semibold">Health</h2>
        <p className="text-sm text-muted-foreground">Live polling every 30 seconds.</p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <HealthRow label="API" ping={apiPing.data} />
          <HealthRow label="DB" ping={dbPing.data} />
          <HealthRow label="Storage" ping={storagePing.data} />
        </div>
      </section>

      <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <h2 className="font-semibold">Performance</h2>
        <p className="text-sm text-muted-foreground">Today&apos;s average durations and slow-operation counts (2s warning / 5s critical).</p>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Metric label="Avg visit submission" value={`${summary?.performance.avgVisitSubmissionMs ?? 0}ms`} loading={summaryLoading} />
          <Metric label="Avg upload duration" value={`${summary?.performance.avgUploadMs ?? 0}ms`} loading={summaryLoading} />
          <Metric label="Slow endpoints today" value={summary?.performance.slowEndpointCount ?? 0} loading={summaryLoading} />
          <Metric label="Slow queries today" value={summary?.performance.slowQueryCount ?? 0} loading={summaryLoading} />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60 lg:col-span-6">
          <h2 className="font-semibold">Authentication</h2>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <Metric label="Successful logins today" value={summary?.auth.successfulLoginsToday ?? 0} loading={summaryLoading} />
            <Metric label="Failed logins today" value={summary?.auth.failedLoginsToday ?? 0} loading={summaryLoading} />
            <Metric label="Failure rate" value={summary?.auth.failureRate ?? "0.0%"} loading={summaryLoading} />
          </div>
          <p className="mt-4 text-xs font-medium text-muted-foreground">Top auth events</p>
          <div className="mt-2 space-y-1">
            {summaryLoading ? (
              <Skeleton className="h-12 w-full rounded-xl" />
            ) : (
              <>
                {(summary?.auth.topAuthEvents ?? []).map((item) => (
                  <div key={item.message} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{item.message}</span>
                    <span className="font-medium">{item.count}</span>
                  </div>
                ))}
                {summaryQuery.isSuccess && (summary?.auth.topAuthEvents.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">No auth failures today.</p>
                ) : null}
              </>
            )}
          </div>
        </div>

        <div className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60 lg:col-span-6">
          <h2 className="font-semibold">Campaign Activity</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Metric label="Submissions today" value={summary?.campaignActivity.totalSubmissionsToday ?? 0} loading={summaryLoading} />
            <Metric label="Active campaigns" value={summary?.campaignActivity.activeCampaigns ?? 0} loading={summaryLoading} />
            <Metric label="Active reps" value={summary?.campaignActivity.activeReps ?? 0} loading={summaryLoading} />
            <Metric label="Photos uploaded" value={summary?.campaignActivity.photosUploaded ?? 0} loading={summaryLoading} />
            <Metric label="Velocity (last hr)" value={summary?.campaignActivity.submissionVelocityPerHour ?? 0} loading={summaryLoading} />
          </div>
        </div>
      </section>

      <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <h2 className="font-semibold">Import Tracking</h2>
        <p className="text-sm text-muted-foreground">No import pipeline yet — all records are currently app-captured.</p>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Metric label="Imported records" value={summary?.importTracking.importedRecords ?? 0} loading={summaryLoading} />
          <Metric label="App-captured records" value={summary?.importTracking.appCapturedRecords ?? 0} loading={summaryLoading} />
          <Metric label="Import batches" value={summary?.importTracking.importBatches ?? 0} loading={summaryLoading} />
          <Metric label="Import errors" value={summary?.importTracking.importErrors ?? 0} loading={summaryLoading} />
        </div>
      </section>

      <section className="rounded-4xl bg-muted/30 p-5 ring-1 ring-border/60">
        <h2 className="font-semibold">Cost Insights</h2>
        <p className="text-sm text-muted-foreground">Real where derivable from stored data; placeholders note what each one needs.</p>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="rounded-[1.6rem] bg-background p-4">
            <p className="text-xs text-muted-foreground">Image count</p>
            {summaryLoading ? <Skeleton className="mt-2 h-7 w-14" /> : <p className="mt-2 text-2xl font-semibold">{summary?.costInsights.storage.imageCount ?? 0}</p>}
          </div>
          <div className="rounded-[1.6rem] bg-background p-4">
            <p className="text-xs text-muted-foreground">Avg image size (7d)</p>
            {summaryLoading ? <Skeleton className="mt-2 h-7 w-16" /> : <p className="mt-2 text-2xl font-semibold">{formatBytes(summary?.costInsights.storage.averageImageSizeBytes ?? 0)}</p>}
          </div>
          <div className="rounded-[1.6rem] bg-background p-4">
            <p className="text-xs text-muted-foreground">Est. monthly growth</p>
            {summaryLoading ? (
              <Skeleton className="mt-2 h-7 w-16" />
            ) : (
              <p className={`mt-2 text-2xl font-semibold ${summary?.costInsights.storage.approachingLimit ? "text-amber-600" : ""}`}>
                {formatBytes(summary?.costInsights.storage.estimatedMonthlyGrowthBytes ?? 0)}
              </p>
            )}
            {!summaryLoading && summary?.costInsights.storage.approachingLimit ? <p className="mt-1 text-xs text-amber-600">Approaching warning threshold</p> : null}
          </div>
          <div className="rounded-[1.6rem] bg-background p-4">
            <p className="text-xs text-muted-foreground">Records stored</p>
            {summaryLoading ? <Skeleton className="mt-2 h-7 w-14" /> : <p className="mt-2 text-2xl font-semibold">{summary?.costInsights.database.totalRecordsStored ?? 0}</p>}
            <p className="mt-1 text-xs text-muted-foreground">Proxy for DB activity, not query counts</p>
          </div>
          <div className="rounded-[1.6rem] bg-background p-4">
            <p className="text-xs text-muted-foreground">Supabase disk usage</p>
            <p className="mt-2 text-2xl font-semibold text-muted-foreground">—</p>
            <p className="mt-1 text-xs text-muted-foreground">{summary?.costInsights.supabaseDisk.note ?? "Requires Supabase Management API"}</p>
          </div>
          <div className="rounded-[1.6rem] bg-background p-4">
            <p className="text-xs text-muted-foreground">Vercel function invocations</p>
            <p className="mt-2 text-2xl font-semibold text-muted-foreground">—</p>
            <p className="mt-1 text-xs text-muted-foreground">{summary?.costInsights.vercelUsage.note ?? "Requires Vercel API token"}</p>
          </div>
        </div>
      </section>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function InfraCard({
  label,
  status,
  latencyMs,
  loading = false,
}: {
  label: string;
  status: string;
  latencyMs?: number;
  loading?: boolean;
}) {
  const tone = status === "healthy" || status === "unhealthy" ? (status === "healthy" ? latencyTone(latencyMs) : "red") : statusTone(status);
  return (
    <div className="rounded-[1.6rem] bg-card p-4 shadow-sm ring-1 ring-border/60">
      <div className="flex items-center gap-2">
        <span className={`size-2.5 rounded-full ${loading ? TONE_DOT.gray : TONE_DOT[tone]}`} />
        <p className="text-sm font-medium">{label}</p>
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-6 w-20" />
      ) : (
        <p className="mt-2 text-xl font-semibold">{latencyMs !== undefined ? `${latencyMs}ms` : status === "configured" ? "Configured" : status === "not_configured" ? "Not configured" : "—"}</p>
      )}
    </div>
  );
}

function ActivityCard({ label, value, series, loading = false }: { label: string; value: number; series?: number[]; loading?: boolean }) {
  const data = (series ?? new Array(24).fill(0)).map((count, index) => ({ hour: index, count }));
  return (
    <div className="rounded-[1.6rem] bg-card p-4 shadow-sm ring-1 ring-border/60">
      <p className="text-xs text-muted-foreground">{label}</p>
      {loading ? <Skeleton className="mt-1 h-7 w-12" /> : <p className="mt-1 text-2xl font-semibold">{value}</p>}
      <div className="mt-3 h-14">
        {loading ? (
          <Skeleton className="h-full w-full rounded-lg" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <Tooltip cursor={false} formatter={(val) => [String(val), label]} />
              <Area type="monotone" dataKey="count" stroke="var(--color-chart-1)" strokeWidth={2} fill="var(--color-chart-1)" fillOpacity={0.18} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function HealthRow({ label, ping }: { label: string; ping?: HealthPing }) {
  const tone = ping?.status === "healthy" ? latencyTone(ping.latencyMs) : ping ? "red" : "gray";
  return (
    <div className="flex items-center justify-between rounded-[1.6rem] bg-background p-4">
      <div className="flex items-center gap-2">
        <span className={`size-2.5 rounded-full ${TONE_DOT[tone]}`} />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <span className={`text-sm font-semibold ${TONE_TEXT[tone]}`}>{ping?.latencyMs !== undefined ? `${ping.latencyMs}ms` : "Checking..."}</span>
    </div>
  );
}

function Metric({ label, value, loading = false }: { label: string; value: string | number; loading?: boolean }) {
  return (
    <div className="rounded-[1.6rem] bg-background p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      {loading ? <Skeleton className="mt-2 h-7 w-14" /> : <p className="mt-2 text-2xl font-semibold">{value}</p>}
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const className =
    severity === "critical"
      ? "bg-destructive/10 text-destructive hover:bg-destructive/10"
      : severity === "error"
      ? "bg-destructive/10 text-destructive hover:bg-destructive/10"
      : severity === "warning"
      ? "bg-amber-500/10 text-amber-600 hover:bg-amber-500/10"
      : "bg-muted text-muted-foreground hover:bg-muted";
  return <Badge className={`rounded-full ${className}`}>{severity}</Badge>;
}
