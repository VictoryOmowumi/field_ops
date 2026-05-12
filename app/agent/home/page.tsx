"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import { ReloadIcon, Task01Icon, Location01Icon, ArrowRight01Icon, Alert02Icon } from "@hugeicons/core-free-icons";

import InstallPromptCard from "@/components/agent/InstallPromptCard";
import { Skeleton } from "@/components/ui/skeleton";
import { authorizedFetch } from "@/lib/api/client";
import { useAgentBootstrap } from "@/hooks/useAgentBootstrap";
import { cn } from "@/lib/utils";

type Campaign = {
  id: string;
  name: string;
  status: string;
  start_date?: string | null;
  end_date?: string | null;
  progressPercent?: number;
  completedVisits?: number;
  target_outlets?: number | null;
};

type Submission = {
  id: string;
  outcome: string;
  createdAt: string;
};

export default function AgentHomePage() {
  const bootstrapQuery = useAgentBootstrap();
  const campaignsQuery = useQuery({
    queryKey: ["agent-home-campaigns"],
    queryFn: async () => {
      const res = await authorizedFetch<{ success: boolean; campaigns?: Campaign[]; message?: string }>("/api/agent/campaigns");
      if (!res.success) throw new Error(res.message || "Unable to load campaigns.");
      return res.campaigns ?? [];
    },
  });
  const submissionsQuery = useQuery({
    queryKey: ["agent-home-submissions"],
    queryFn: async () => {
      const res = await authorizedFetch<{ success: boolean; submissions?: Submission[]; message?: string }>("/api/agent/submissions");
      if (!res.success) throw new Error(res.message || "Unable to load submissions.");
      return res.submissions ?? [];
    },
  });

  useEffect(() => {
    if (bootstrapQuery.error) toast.error((bootstrapQuery.error as Error).message);
  }, [bootstrapQuery.error]);
  useEffect(() => {
    if (campaignsQuery.error) toast.error((campaignsQuery.error as Error).message);
  }, [campaignsQuery.error]);
  useEffect(() => {
    if (submissionsQuery.error) toast.error((submissionsQuery.error as Error).message);
  }, [submissionsQuery.error]);

  const campaigns = useMemo(() => campaignsQuery.data ?? [], [campaignsQuery.data]);
  const submissions = useMemo(() => submissionsQuery.data ?? [], [submissionsQuery.data]);
  const syncState = bootstrapQuery.data?.syncState;

  const todayStats = useMemo(() => {
    const today = new Date().toDateString();
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = yesterdayDate.toDateString();
    const todaysSubmissions = submissions.filter((item) => item.createdAt && new Date(item.createdAt).toDateString() === today);
    const yesterdaysSubmissions = submissions.filter((item) => item.createdAt && new Date(item.createdAt).toDateString() === yesterday);
    return {
      visitsToday: todaysSubmissions.length,
      visitsYesterday: yesterdaysSubmissions.length,
    };
  }, [submissions]);

  const activeCampaigns = campaigns.filter((item) => item.status?.toLowerCase() === "active");
  const featuredCampaigns = [...campaigns]
    .sort((a, b) => (b.status?.toLowerCase() === "active" ? 1 : 0) - (a.status?.toLowerCase() === "active" ? 1 : 0))
    .slice(0, 3);
  const nextCampaign = featuredCampaigns[0] ?? null;

  const displayName = bootstrapQuery.data?.profile.fullName || "Field Agent";
  const isLoading = bootstrapQuery.isLoading || campaignsQuery.isLoading || submissionsQuery.isLoading;
  const identityLoading = bootstrapQuery.isPending || (!bootstrapQuery.data?.profile?.fullName && bootstrapQuery.isFetching);
  const activeRate = campaigns.length ? (activeCampaigns.length / campaigns.length) * 100 : 0;
  const visitsChangeText = useMemo(() => {
    const previous = todayStats.visitsYesterday;
    const current = todayStats.visitsToday;
    if (previous === 0) return current === 0 ? "0% vs yesterday" : "New vs yesterday";
    const delta = ((current - previous) / previous) * 100;
    return `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}% vs yesterday`;
  }, [todayStats.visitsToday, todayStats.visitsYesterday]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <main className="mt-2 space-y-5 pb-24">
      <InstallPromptCard />
      <section>
        {identityLoading ? (
          <>
            <Skeleton className="mt-3 h-8 w-60 bg-white/20" />
            <Skeleton className="mt-2 h-6 w-44 bg-white/20" />
            <Skeleton className="mt-4 h-16 rounded-3xl bg-white/20" />
          </>
        ) : (
          <>
            <h1 className="mt-3 text-3xl font-semibold leading-tight">
              <span>{greeting}, </span>
              {displayName.split(" ")[0]}
            </h1>
            <p className="ml-1 max-w-62 text-base">Are you ready? Let&apos;s go.</p>
            {nextCampaign ? (
              <Link
                href={`/agent/campaigns/${nextCampaign.id}`}
                className="mt-4 flex items-center justify-between rounded-3xl border border-primary/30 bg-primary/10 p-4"
              >
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-primary">Next action</p>
                  <p className="line-clamp-1 text-sm font-semibold">Continue: {nextCampaign.name}</p>
                </div>
                <HugeiconsIcon icon={ArrowRight01Icon} size={18} strokeWidth={1.8} />
              </Link>
            ) : null}
          </>
        )}

        <div className="mt-5 grid grid-cols-2 gap-2">
          <HeroStat
            loading={isLoading}
            label="Active"
            value={String(activeCampaigns.length)}
            change={`${activeRate.toFixed(1)}% active`}
            icon={<HugeiconsIcon icon={Task01Icon} size={16} strokeWidth={1.8} />}
          />
          <HeroStat
            loading={isLoading}
            label="Visits"
            value={String(todayStats.visitsToday)}
            change={visitsChangeText}
            icon={<HugeiconsIcon icon={Location01Icon} size={16} strokeWidth={1.8} />}
          />
        </div>
      </section>

      {syncState && (syncState.pending > 0 || syncState.failed > 0) ? (
        <Link
          href="/agent/sync"
          className={cn(
            "flex items-center justify-between rounded-3xl border p-4 shadow-sm",
            syncState.failed > 0 ? "border-red-200 bg-red-50 text-red-950" : "border-amber-200 bg-amber-50 text-amber-950"
          )}
        >
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white/80">
              <HugeiconsIcon icon={syncState.failed > 0 ? Alert02Icon : ReloadIcon} size={20} strokeWidth={1.8} />
            </div>
            <div>
              <p className="text-sm font-semibold">{syncState.failed > 0 ? "Sync attention needed" : "Pending sync"}</p>
              <p className="text-xs opacity-75">
                {syncState.failed > 0 ? `${syncState.failed} failed record(s). Review now.` : `${syncState.pending} record(s) waiting to upload.`}
              </p>
            </div>
          </div>
          <HugeiconsIcon icon={ArrowRight01Icon} size={18} strokeWidth={1.8} />
        </Link>
      ) : null}

      <section className="space-y-3 mt-2">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Campaigns to Execute</h2>
            <p className="text-xs text-muted-foreground">Started vs not started with quick progress.</p>
          </div>
          {campaigns.length > 3 ? (
            <Link href="/agent/campaigns" className="text-xs font-semibold text-primary">
              View all
            </Link>
          ) : null}
        </div>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-28 rounded-3xl" />
            <Skeleton className="h-28 rounded-3xl" />
          </div>
        ) : featuredCampaigns.length ? (
          <div className="space-y-3">
            {featuredCampaigns.map((campaign) => (
              <CampaignCard key={campaign.id} campaign={campaign} />
            ))}
          </div>
        ) : (
          <Link href="/agent/campaigns" className="block rounded-3xl border border-dashed bg-card p-5 text-center">
            <p className="font-semibold">No campaign assigned yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Check again or contact your supervisor.</p>
          </Link>
        )}
      </section>
    </main>
  );
}

function HeroStat({
  label,
  value,
  icon,
  change,
  loading,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  change: string;
  loading?: boolean;
}) {
  return (
    <div className="relative min-h-40 overflow-hidden rounded-[1.35rem] border border-zinc-200 bg-zinc-100 p-3.5 text-zinc-950">
      <div className="flex items-center gap-2">
        <div className="flex size-8 items-center justify-center rounded-full border border-zinc-300 bg-white text-zinc-700">{icon}</div>
        <p className="text-lg font-medium text-zinc-700">{label}</p>
      </div>
      <div className="mt-3 flex items-end gap-2">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-16 bg-black/10" />
            <Skeleton className="h-3 w-24 bg-black/10" />
          </div>
        ) : (
          <>
            <p className="mt-1 text-[1.75rem] font-semibold leading-none">{value}</p>
            <p className="mt-3 text-[11px] text-zinc-500">{change}</p>
          </>
        )}
      </div>
      <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="mt-4 h-8 w-full" aria-hidden="true">
        <path
          d="M0 19 C8 24,14 8,22 14 C30 20,38 6,46 13 C54 20,62 10,70 15 C78 20,86 10,94 18 C97 20,99 17,100 19"
          fill="none"
          stroke="#ea580c"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

function CampaignCard({ campaign }: { campaign: Campaign }) {
  const started = campaign.status?.toLowerCase() === "active" || campaign.status?.toLowerCase() === "completed";
  const progress =
    typeof campaign.progressPercent === "number"
      ? Math.max(0, Math.min(100, campaign.progressPercent))
      : campaign.status?.toLowerCase() === "completed"
        ? 100
        : 0;
  const statusText = started ? "Started" : "Not started";

  return (
    <Link href={`/agent/campaigns/${campaign.id}`} className="group block rounded-3xl border border-border/70 bg-card p-4 shadow transition active:scale-[0.99]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="line-clamp-2 text-base font-semibold leading-tight">{campaign.name}</p>
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <span>{statusText}</span>
            <span>•</span>
            <span>
              {campaign.completedVisits ?? 0}
              {campaign.target_outlets ? `/${campaign.target_outlets}` : ""} visits • {Math.round(progress)}% done
            </span>
          </div>
        </div>
        <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold", started ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700")}>
          {statusText}
        </span>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${started ? progress : 6}%` }} />
      </div>
      <div className="mt-6 flex items-center justify-between border-t pt-3">
        <p className="text-xs text-muted-foreground">Open workspace</p>
        <div className="grid h-8 w-8 place-items-center rounded-full bg-muted transition group-hover:bg-primary group-hover:text-primary-foreground">
          <HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={1.8} />
        </div>
      </div>
    </Link>
  );
}
