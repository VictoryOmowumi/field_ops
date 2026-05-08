"use client";

import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import MetricCard from "@/components/agent/MetricCard";
import SectionHeader from "@/components/agent/SectionHeader";
import StatusPill from "@/components/agent/StatusPill";
import LogoutButton from "@/components/auth/LogoutButton";
import InstallAppButton from "@/components/pwa/InstallAppButton";
import { authorizedFetch } from "@/lib/api/client";

type Bootstrap = {
  profile: {
    fullName?: string;
    email?: string | null;
    phone?: string | null;
    organizationRole?: string;
  };
  assignedCampaigns: Array<{ id: string; status: string }>;
  syncState: { pending: number; failed: number };
};

export default function ProfilePage() {
  const query = useQuery({
    queryKey: ["agent-profile-bootstrap"],
    queryFn: async () => (await authorizedFetch<{ success: boolean; bootstrap: Bootstrap }>("/api/agent/bootstrap")).bootstrap,
  });
  if (query.error) toast.error((query.error as Error).message);

  const bootstrap = query.data;
  const activeCampaigns = (bootstrap?.assignedCampaigns ?? []).filter((c) => c.status === "active").length;

  return (
    <main className="space-y-4 pt-4">
      <SectionHeader title="Profile" subtitle="Account and field preferences." />

      <section className="rounded-3xl border border-border/70 bg-card p-4 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">{bootstrap?.profile.fullName ?? "Agent"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {(bootstrap?.profile.organizationRole ?? "agent")} • ActivationIQ
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <StatusPill status="online" />
          <StatusPill status="synced" />
        </div>
        <div className="mt-4 space-y-1 text-xs text-muted-foreground">
          <p>{bootstrap?.profile.phone ?? "-"}</p>
          <p>{bootstrap?.profile.email ?? "-"}</p>
        </div>
        <div className="mt-4">
          <LogoutButton />
        </div>
        <div className="mt-2">
          <InstallAppButton className="rounded-full" />
        </div>
      </section>

      <section className="grid grid-cols-3 gap-3">
        <MetricCard label="Active Campaigns" value={String(activeCampaigns)} delta="Assigned now" tone="blue" />
        <MetricCard label="Pending Sync" value={String(bootstrap?.syncState.pending ?? 0)} delta="Local queue" tone="amber" />
        <MetricCard label="Sync Failures" value={String(bootstrap?.syncState.failed ?? 0)} delta="Needs retry" tone="green" />
      </section>
    </main>
  );
}
