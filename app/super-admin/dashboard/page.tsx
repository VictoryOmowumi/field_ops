"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabaseClient } from "@/lib/supabase/client";
import type { PlatformDashboardSummary } from "@/types/platform";

export default function SuperAdminDashboardPage() {
  const [summary, setSummary] = useState<PlatformDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSummary() {
      const { data } = await supabaseClient.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setLoading(false);
        toast.error("Session expired. Please sign in again.");
        return;
      }

      const response = await fetch("/api/platform/dashboard/summary", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = (await response.json()) as {
        success: boolean;
        message?: string;
        summary?: PlatformDashboardSummary;
      };

      setLoading(false);
      if (!response.ok || !result.success || !result.summary) {
        toast.error(result.message ?? "Failed to load dashboard summary.");
        return;
      }
      setSummary(result.summary);
    }

    void loadSummary();
  }, []);

  return (
    <div className="flex flex-col gap-6 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Platform Overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">Monitor tenant onboarding, campaign activity, and platform health.</p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" className="h-11 rounded-full px-5" asChild>
            <Link href="/super-admin/organizations">View Organizations</Link>
          </Button>
          <Button className="h-11 rounded-full px-5" asChild>
            <Link href="/super-admin/organizations/new">Create Organization</Link>
          </Button>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60 lg:col-span-7">
          <h2 className="font-medium">Tenant Health Summary</h2>
          <p className="text-sm font-light text-muted-foreground">Rollup of active organizations and campaign load.</p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Metric label="Organizations" value={loading ? "..." : String(summary?.organizations ?? 0)} note="All tenants" />
            <Metric label="Active organizations" value={loading ? "..." : String(summary?.activeOrganizations ?? 0)} note="Currently operating" />
            <Metric label="Total campaigns" value={loading ? "..." : String(summary?.totalCampaigns ?? 0)} note="Across tenants" />
            <Metric label="Total reps" value={loading ? "..." : String(summary?.totalReps ?? 0)} note="Assigned field agents" />
          </div>
        </div>

        <div className="rounded-4xl bg-foreground p-5 text-background shadow-sm lg:col-span-5">
          <h2 className="font-medium">Platform Health</h2>
          <p className="text-sm opacity-70">Operational reliability across sync and onboarding.</p>
          <div className="mt-6 space-y-3">
            <Health label="Sync success rate" value={summary?.syncSuccessRate ?? "0.0%"} />
            <Health label="Freshness under 5 min" value={summary?.freshnessUnder5Min ?? "0.0%"} />
            <Health label="Invite completion" value={summary?.inviteCompletionRate ?? "0.0%"} />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60 lg:col-span-7">
          <h2 className="font-semibold">Organization Snapshot</h2>
          <p className="text-sm text-muted-foreground">Quick access to major tenant accounts.</p>
          <div className="mt-5 overflow-hidden rounded-3xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Organization</th>
                  <th className="px-4 py-3 text-left font-medium">Org ID</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Campaigns</th>
                </tr>
              </thead>
              <tbody>
                {(summary?.organizationSnapshot ?? []).map((org) => (
                  <tr key={org.id} className="border-t border-border">
                    <td className="px-4 py-4 font-medium"><Link href={`/super-admin/organizations/${org.id}`} className="hover:underline">{org.name}</Link></td>
                    <td className="px-4 py-4 text-muted-foreground">{org.id}</td>
                    <td className="px-4 py-4"><Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/10">{org.status}</Badge></td>
                    <td className="px-4 py-4">{org.totalCampaigns}</td>
                  </tr>
                ))}
                {!loading && (summary?.organizationSnapshot.length ?? 0) === 0 ? (
                  <tr className="border-t border-border"><td className="px-4 py-4 text-muted-foreground" colSpan={4}>No organizations found.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60 lg:col-span-5">
          <h2 className="font-semibold">Incidents & Attention</h2>
          <p className="text-sm text-muted-foreground">Recent cross-tenant issues requiring follow-up.</p>
          <div className="mt-4 space-y-3">
            {(summary?.incidents ?? []).map((item) => (
              <div key={`${item.organization}-${item.issue}-${item.time}`} className="rounded-3xl bg-muted/35 p-4">
                <p className="font-medium">{item.organization}</p>
                <p className="mt-1 text-sm text-muted-foreground">{item.issue}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.severity} · {item.time}</p>
              </div>
            ))}
            {!loading && (summary?.incidents.length ?? 0) === 0 ? (
              <div className="rounded-3xl bg-muted/35 p-4 text-sm text-muted-foreground">No active incidents.</div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-[1.6rem] bg-background p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

function Health({ label, value }: { label: string; value: string }) {
  const parsed = Number.parseFloat(value.replace("%", ""));
  const safe = Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm"><span className="opacity-80">{label}</span><span>{value}</span></div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-background/20">
        <div className="h-full rounded-full bg-primary" style={{ width: `${safe}%` }} />
      </div>
    </div>
  );
}
