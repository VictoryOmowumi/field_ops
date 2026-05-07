"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ReloadIcon,
  SaleTag01Icon,
  Task01Icon,
  Location01Icon,
  ArrowRight01Icon,
  Alert02Icon,
} from "@hugeicons/core-free-icons";

import ActionTile from "@/components/agent/ActionTile";
import InstallPromptCard from "@/components/agent/InstallPromptCard";
import { Skeleton } from "@/components/ui/skeleton";
import { authorizedFetch } from "@/lib/api/client";
import { cn } from "@/lib/utils";

type BootstrapCampaign = { id: string; name: string; status: string };

type Bootstrap = {
  profile: { fullName: string };
  assignedCampaigns: BootstrapCampaign[];
  syncState: { pending: number; failed: number };
};

type Campaign = {
  id: string;
  name: string;
  status: string;
  state?: string | null;
  lga?: string | null;
};

type Submission = {
  id: string;
  outcome: string;
  createdAt: string;
};

export default function AgentHomePage() {


  const bootstrapQuery = useQuery({
    queryKey: ["agent-bootstrap-home"],
    queryFn: async () => {
      const res = await authorizedFetch<{ success: boolean; bootstrap?: Bootstrap; message?: string }>(
        "/api/agent/bootstrap"
      );

      if (!res.success || !res.bootstrap) {
        throw new Error(res.message || "Unable to load agent profile.");
      }

      return res.bootstrap;
    },
  });

  const campaignsQuery = useQuery({
    queryKey: ["agent-home-campaigns"],
    queryFn: async () => {
      const res = await authorizedFetch<{ success: boolean; campaigns?: Campaign[]; message?: string }>(
        "/api/agent/campaigns"
      );

      if (!res.success) {
        throw new Error(res.message || "Unable to load campaigns.");
      }

      return res.campaigns ?? [];
    },
  });

  const submissionsQuery = useQuery({
    queryKey: ["agent-home-submissions"],
    queryFn: async () => {
      const res = await authorizedFetch<{ success: boolean; submissions?: Submission[]; message?: string }>(
        "/api/agent/submissions"
      );

      if (!res.success) {
        throw new Error(res.message || "Unable to load submissions.");
      }

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

  const todaysSubmissions = submissions.filter((item) => {
    if (!item.createdAt) return false;
    return new Date(item.createdAt).toDateString() === today;
  });

  return {
    visitsToday: todaysSubmissions.length,
    soldToday: todaysSubmissions.filter(
      (item) => item.outcome?.toLowerCase() === "converted"
    ).length,
  };
}, [submissions]);

  const activeCampaigns = campaigns.filter((item) => item.status?.toLowerCase() === "active");

  const featuredCampaigns = [...campaigns]
    .sort((a, b) => {
      const aActive = a.status?.toLowerCase() === "active" ? 1 : 0;
      const bActive = b.status?.toLowerCase() === "active" ? 1 : 0;
      return bActive - aActive;
    })
    .slice(0, 3);

  const displayName = bootstrapQuery.data?.profile.fullName || "Field Agent";
  const isLoading = bootstrapQuery.isLoading || campaignsQuery.isLoading || submissionsQuery.isLoading;

  return (
    <main className="space-y-5 pb-24 mt-5">
      <InstallPromptCard />
      <section className="relative overflow-hidden ">
      
        <div className="relative">
          
          {isLoading ? (
            <Skeleton className="mt-3 h-8 w-44 bg-white/20" />
          ) : (
            <h1 className="mt-3 text-3xl font-semibold leading-tight">
             <span className=" text-foreground">Hi, </span> 
              {displayName.split(" ")[0]}
            </h1>
          )}

          <p className="mt-1 max-w-[260px] text-sm text-foreground">
            Start a campaign, record outlet activity, and keep your field data synced.
          </p>

          <div className="mt-5 grid grid-cols-3 gap-2">
            <HeroStat label="Active" value={isLoading ? "..." : String(activeCampaigns.length)} />
            <HeroStat label="Visits" value={isLoading ? "..." : String(todayStats.visitsToday)} />
            <HeroStat label="Sales" value={isLoading ? "..." : String(todayStats.soldToday)} />
          </div>
        </div>
      </section>

      {syncState && (syncState.pending > 0 || syncState.failed > 0) ? (
        <Link
          href="/agent/sync"
          className={cn(
            "flex items-center justify-between rounded-3xl border p-4 shadow-sm",
            syncState.failed > 0
              ? "border-red-200 bg-red-50 text-red-950"
              : "border-amber-200 bg-amber-50 text-amber-950"
          )}
        >
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white/80">
              <HugeiconsIcon icon={syncState.failed > 0 ? Alert02Icon : ReloadIcon} size={20} strokeWidth={1.8} />
            </div>

            <div>
              <p className="text-sm font-semibold">
                {syncState.failed > 0 ? "Sync attention needed" : "Pending sync"}
              </p>
              <p className="text-xs opacity-75">
                {syncState.failed > 0
                  ? `${syncState.failed} failed record(s). Review now.`
                  : `${syncState.pending} record(s) waiting to upload.`}
              </p>
            </div>
          </div>

          <HugeiconsIcon icon={ArrowRight01Icon} size={18} strokeWidth={1.8} />
        </Link>
      ) : null}

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Quick Actions</h2>
          <p className="text-xs text-muted-foreground">Common field operations.</p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <ActionTile
            title="Campaigns"
            href="/agent/campaigns"
            accent="orange"
            icon={<HugeiconsIcon icon={Task01Icon} size={16} strokeWidth={1.8} />}
          />

          <ActionTile
            title="Sync"
            href="/agent/sync"
            accent="amber"
            icon={<HugeiconsIcon icon={ReloadIcon} size={16} strokeWidth={1.8} />}
          />

          <ActionTile
            title="Activity"
            href="/agent/sales"
            accent="green"
            icon={<HugeiconsIcon icon={SaleTag01Icon} size={16} strokeWidth={1.8} />}
          />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Campaigns to Execute</h2>
            <p className="text-xs text-muted-foreground">Prioritized active campaigns.</p>
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
            <Skeleton className="h-24 rounded-3xl" />
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

function HeroStat({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="bg-card border border-border/50 p-4 rounded-[2rem] flex flex-col items-center justify-center text-center">
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <span className="text-2xl font-bold">{value}</span>
    </div>
  );
}

function CampaignCard({ campaign }: { campaign: Campaign }) {
  const isActive = campaign.status?.toLowerCase() === "active";

  return (
    <Link
      href={`/agent/campaigns/${campaign.id}`}
      className="group block rounded-3xl border border-border/70 bg-card p-4 shadow-sm transition active:scale-[0.99]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="line-clamp-2 text-base font-semibold leading-tight">{campaign.name}</p>

          <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <HugeiconsIcon icon={Location01Icon} size={14} strokeWidth={1.8} />
            <span className="truncate">
              {[campaign.lga, campaign.state].filter(Boolean).join(", ") || "No territory set"}
            </span>
          </div>
        </div>

        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize",
            isActive ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"
          )}
        >
          {campaign.status || "Unknown"}
        </span>
      </div>

      <div className="mt-4 flex items-center justify-between border-t pt-3">
        <p className="text-xs text-muted-foreground">
          Tap to continue execution
        </p>

        <div className="grid h-8 w-8 place-items-center rounded-full bg-muted transition group-hover:bg-primary group-hover:text-primary-foreground">
          <HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={1.8} />
        </div>
      </div>
    </Link>
  );
}
