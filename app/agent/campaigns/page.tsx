"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import SectionHeader from "@/components/agent/SectionHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { authorizedFetch } from "@/lib/api/client";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import {
  cacheAgentCampaigns,
  getCachedAgentCampaigns,
  isLikelyOfflineError,
  isOfflinePreloadRequiredError,
  OfflinePreloadRequiredError,
} from "@/lib/offline/agent-cache";

type Campaign = {
  id: string;
  name: string;
  status: string;
  start_date?: string | null;
  end_date?: string | null;
  state?: string | null;
  lga?: string | null;
  progressPercent?: number;
  completedVisits?: number;
  target_outlets?: number | null;
};

type OfflineList<T> = {
  items: T[];
  offlineStatus: "fresh" | "cached";
};

function formatCampaignDateRange(startDate?: string | null, endDate?: string | null) {
  const format = (value?: string | null) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };

  const start = format(startDate);
  const end = format(endDate);

  if (start && end) return `${start} - ${end}`;
  if (start) return `Starts ${start}`;
  if (end) return `Ends ${end}`;
  return "Date not set";
}

function getExecutionStatus(campaign: Campaign) {
  const normalized = campaign.status?.toLowerCase();
  if (normalized === "completed") return { label: "Completed", tone: "bg-zinc-200 text-zinc-700" };
  if (normalized === "active") return { label: "Started", tone: "bg-emerald-400/10 text-emerald-500" };

  const now = Date.now();
  const start = campaign.start_date ? new Date(campaign.start_date).getTime() : null;
  if (start && !Number.isNaN(start) && now >= start) {
    return { label: "Started", tone: "bg-emerald-100 text-emerald-700" };
  }

  return { label: "Not started", tone: "bg-amber-100 text-amber-700" };
}

function getTimelineProgress(campaign: Campaign) {
  if (typeof campaign.progressPercent === "number") return Math.max(0, Math.min(100, campaign.progressPercent));
  const normalized = campaign.status?.toLowerCase();
  if (normalized === "completed") return 100;
  return 0;
}

export default function AgentCampaignsPage() {
  const isOnline = useOnlineStatus();
  const query = useQuery({
    queryKey: ["agent-campaigns"],
    queryFn: async (): Promise<OfflineList<Campaign>> => {
      try {
        const campaigns = (await authorizedFetch<{ success: boolean; campaigns: Campaign[] }>("/api/agent/campaigns")).campaigns ?? [];
        await cacheAgentCampaigns(campaigns);
        return { items: campaigns, offlineStatus: "fresh" };
      } catch (error) {
        if (isLikelyOfflineError(error)) {
          const cached = await getCachedAgentCampaigns<Campaign>();
          if (cached) return { items: cached, offlineStatus: "cached" };
          throw new OfflinePreloadRequiredError("Reconnect once to load your assigned campaigns for offline use.");
        }
        throw error;
      }
    },
  });

  useEffect(() => {
    if (query.error && !isOfflinePreloadRequiredError(query.error)) toast.error((query.error as Error).message);
  }, [query.error]);

  const campaigns = query.data?.items ?? [];
  const usingCachedData = query.data?.offlineStatus === "cached";
  const needsOnlinePreload = isOfflinePreloadRequiredError(query.error);

  return (
    <main className="space-y-4 pt-4">
      <div className="flex items-start justify-between gap-3">
        <SectionHeader title="My Campaigns" subtitle="Select an active campaign workspace." />
        {(!isOnline || usingCachedData) && !needsOnlinePreload ? (
          <Badge variant="outline" className="mt-1 shrink-0 border-amber-300 bg-amber-50 text-amber-900">
            Offline mode
          </Badge>
        ) : null}
      </div>

      {needsOnlinePreload ? (
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
          <Badge variant="outline" className="border-amber-300 bg-white/70 text-amber-900">Needs online preload</Badge>
          <p className="mt-3 text-sm font-medium">Campaigns are not saved on this device yet.</p>
          <p className="mt-1 text-sm opacity-80">Reconnect once and open this page to prepare campaign assignments for offline use.</p>
        </section>
      ) : null}

      {usingCachedData && !needsOnlinePreload ? (
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
          <p className="text-sm font-semibold">Showing cached campaigns</p>
          <p className="mt-1 text-xs opacity-80">Reconnect to refresh assignments, progress, and campaign dates.</p>
        </section>
      ) : null}

      <section className="space-y-3">
        {query.isLoading ? (
          <>
            <Skeleton className="h-32 rounded-4xl" />
            <Skeleton className="h-32 rounded-4xl" />
            <Skeleton className="h-32 rounded-4xl" />
          </>
        ) : campaigns.map((campaign) => {
          const executionStatus = getExecutionStatus(campaign);
          const progress = getTimelineProgress(campaign);
          return (
            <div key={campaign.id} className="rounded-4xl border border-border/70 bg-card p-4 shadow">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-semibold">{campaign.name}</p>
                  <p className="mt-2 text-xs text-muted-foreground whitespace-nowrap">
                    {formatCampaignDateRange(campaign.start_date, campaign.end_date)}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${executionStatus.tone}`}>
                    {executionStatus.label}
                  </span>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {campaign.completedVisits ?? 0}
                    {campaign.target_outlets ? `/${campaign.target_outlets}` : ""} visits - {Math.round(progress)}% done
                  </p>
                </div>
              </div>
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${executionStatus.label === "Not started" ? 6 : Math.max(6, progress)}%` }} />
              </div>
              <div className="mt-4 flex justify-end">
                <Button asChild className="h-9 rounded-full"><Link href={`/agent/campaigns/${campaign.id}`}>Open Workspace</Link></Button>
              </div>
            </div>
          );
        })}
        {!query.isLoading && !needsOnlinePreload && campaigns.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            No campaign assigned yet. Check again or contact your supervisor.
          </p>
        ) : null}
      </section>
    </main>
  );
}
