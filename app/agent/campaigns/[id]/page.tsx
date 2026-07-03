"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import AgentBackButton from "@/components/agent/AgentBackButton";
import SectionHeader from "@/components/agent/SectionHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { authorizedFetch } from "@/lib/api/client";
import {
  cacheAgentCampaignDetail,
  cacheAgentCampaignSubmissions,
  getCachedAgentCampaignDetail,
  getCachedAgentCampaignSubmissions,
  isLikelyOfflineError,
  isOfflinePreloadRequiredError,
  OfflinePreloadRequiredError,
  type OfflineAware,
} from "@/lib/offline/agent-cache";
import type { CampaignWorkflowConfigV1 } from "@/types/workflow";

type CampaignResponse = {
  id: string;
  name: string;
  state?: string | null;
  lga?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  outlet_types?: string[];
  products?: Array<{ sku?: string; name?: string }>;
  workflow?: CampaignWorkflowConfigV1;
  stats: {
    visitsToday: number;
    conversions: number;
    pendingOrRevisit: number;
  };
  campaign_tasks?: string[];
};

type SubmissionRow = {
  id: string;
  outcome: string;
  outcomeLabel?: string | null;
  syncStatus: "pending" | "synced" | "failed";
  createdAt: string;
  outlet: string;
  taskType?: string | null;
};

type OfflineList<T> = {
  items: T[];
  offlineStatus: "fresh" | "cached";
};

export default function AgentCampaignWorkspacePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const query = useQuery({
    queryKey: ["agent-campaign", id],
    retry: (_, error) => !isLikelyOfflineError(error) && !isOfflinePreloadRequiredError(error),
    queryFn: async (): Promise<OfflineAware<CampaignResponse>> => {
      try {
        const campaign = (await authorizedFetch<{ success: boolean; campaign: CampaignResponse }>(`/api/agent/campaigns/${id}`)).campaign;
        await cacheAgentCampaignDetail(campaign);
        return { ...campaign, offlineStatus: "fresh" };
      } catch (error) {
        if (isLikelyOfflineError(error)) {
          const cached = await getCachedAgentCampaignDetail<CampaignResponse>(id);
          if (cached) return { ...cached, offlineStatus: "cached" };
          throw new OfflinePreloadRequiredError("Reconnect once and open this campaign before starting visits offline.");
        }
        throw error;
      }
    },
  });

  useEffect(() => {
    if (query.error && !isOfflinePreloadRequiredError(query.error)) toast.error((query.error as Error).message);
  }, [query.error]);

  const campaign = query.data;

  const submissionsQuery = useQuery({
    queryKey: ["agent-campaign-submissions", id],
    retry: (_, error) => !isLikelyOfflineError(error) && !isOfflinePreloadRequiredError(error),
    queryFn: async (): Promise<OfflineList<SubmissionRow>> => {
      try {
        const submissions = (
          await authorizedFetch<{ success: boolean; submissions: SubmissionRow[] }>(
            `/api/agent/submissions?campaignId=${id}`
          )
        ).submissions ?? [];
        await cacheAgentCampaignSubmissions(id, submissions);
        return { items: submissions, offlineStatus: "fresh" };
      } catch (error) {
        if (isLikelyOfflineError(error)) {
          const cached = await getCachedAgentCampaignSubmissions<SubmissionRow>(id);
          return { items: cached ?? [], offlineStatus: "cached" };
        }
        throw error;
      }
    },
  });

  useEffect(() => {
    if (submissionsQuery.error && !isOfflinePreloadRequiredError(submissionsQuery.error)) toast.error((submissionsQuery.error as Error).message);
  }, [submissionsQuery.error]);

  const needsOnlinePreload = isOfflinePreloadRequiredError(query.error);
  const usingCachedData = campaign?.offlineStatus === "cached" || submissionsQuery.data?.offlineStatus === "cached";
  const submissions = submissionsQuery.data?.items ?? [];

  if (needsOnlinePreload) {
    return (
      <main className="space-y-4 pt-4">
        <AgentBackButton href="/agent/campaigns" />
        <SectionHeader title="Campaign" subtitle="Offline preparation needed" />
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
          <Badge variant="outline" className="border-amber-300 bg-white/70 text-amber-900">Needs online preload</Badge>
          <p className="mt-3 text-sm font-medium">This campaign workflow is not saved on this device yet.</p>
          <p className="mt-1 text-sm opacity-80">Reconnect once and open this campaign before going offline to start visits.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="space-y-4 pt-4">
      <AgentBackButton href="/agent/campaigns" />
      {usingCachedData ? (
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">Offline mode</p>
            <Badge variant="outline" className="border-amber-300 bg-white/70 text-amber-900">Cached campaign</Badge>
          </div>
          <p className="mt-1 text-xs opacity-80">You can start a visit from this cached workflow. Reconnect to refresh progress and recent activity.</p>
        </section>
      ) : null}
      <SectionHeader title={campaign?.name ?? "Campaign"} subtitle="Campaign workspace" />
      <section className="grid grid-cols-3 gap-3">
        <Stat label="Visits Today" value={String(campaign?.stats.visitsToday ?? 0)} />
        <Stat label="Conversions" value={String(campaign?.stats.conversions ?? 0)} />
        <Stat label="Pending/Revisit" value={String(campaign?.stats.pendingOrRevisit ?? 0)} />
      </section>
      <Button asChild className="mt-4 w-full rounded-full" disabled={!campaign}>
        <Link href={`/agent/campaigns/${id}/visit/start`}>
          {campaign?.stats.visitsToday ? "Continue Visit" : "Start Visit"}
        </Link>
      </Button>

      <section>
        <h2 className="text-sm font-medium">Recent Submissions</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Latest captured visits for this campaign.
        </p>
        <div className="mt-3 space-y-2">
          {submissions.slice(0, 3).map((item) => (
            <Link key={item.id} href={`/agent/sales/${item.id}`} className="block rounded-2xl border border-border/70 bg-background p-3">
              <div className="flex justify-between">
                <p className="text-sm font-medium">{item.outlet}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(item.createdAt).toLocaleString()}
                </p>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatTaskLabel(item.taskType)} - {item.outcomeLabel || formatOutcomeLabel(item.outcome)}
              </p>
            </Link>
          ))}
          {submissions.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border p-3 text-xs text-muted-foreground">
              No submissions yet. Start a visit to capture activity.
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-border/70 bg-card p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p></div>;
}

function formatTaskLabel(taskType?: string | null) {
  if (!taskType) return "Visit";
  if (taskType === "sell_to_outlet") return "Sales Capture";
  if (taskType === "revisit_outlet") return "Outlet Revisit";
  if (taskType === "register_outlet") return "Outlet Registration";
  if (taskType === "availability_survey") return "Availability Check";
  if (taskType === "price_survey") return "Price Check";
  if (taskType === "product_survey") return "Product Audit";
  return "Visit";
}

function formatOutcomeLabel(outcome: string) {
  if (outcome === "converted") return "Products sold";
  if (outcome === "pending") return "Pending sync";
  if (outcome === "revisit") return "Outlet closed / revisit";
  if (outcome === "no_sale") return "Customer refused";
  if (outcome === "registered_only") return "Visit completed";
  return outcome.replaceAll("_", " ");
}
