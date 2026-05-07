"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { FileEmpty02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import TableEmptyStateRow from "@/components/shared/TableEmptyStateRow";
import { authorizedFetch } from "@/lib/api/client";
import TableLoadingState from "@/components/shared/TableLoadingState";

type Campaign = {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  campaign_type?: string | null;
  start_date: string | null;
  end_date: string | null;
  status: "draft" | "active" | "completed";
  state?: string | null;
  lga?: string | null;
  assigned_reps_count?: number;
  visits_count?: number;
  conversions_count?: number;
  conversion_rate?: number;
  last_activity_at?: string | null;
  created_at: string;
};

export default function CampaignsPage() {
  const query = useQuery({
    queryKey: ["admin-campaigns"],
    queryFn: async () => {
      const result = await authorizedFetch<{ success: boolean; campaigns?: Campaign[] }>("/api/admin/campaigns");
      return result.campaigns ?? [];
    },
  });
  const campaigns = query.data ?? [];
  const loading = query.isLoading;

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Campaigns</h1>
          <p className="mt-1 text-sm text-muted-foreground">Create, monitor, and manage field activation campaigns.</p>
        </div>

        <Button asChild className="rounded-full px-5">
          <Link href="/admin/campaigns/new">Create Campaign</Link>
        </Button>
      </div>

      <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-medium">All Campaigns</h2>
            <p className="text-sm text-muted-foreground">Track campaign setup, progress, and performance.</p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-3xl border border-border">
          <table className="min-w-[1200px] w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Campaign</th>
                <th className="px-4 py-3 text-left font-medium">Territory</th>
                <th className="px-4 py-3 text-left font-medium">Timeline</th>
                <th className="px-4 py-3 text-left font-medium">Assigned Reps</th>
                <th className="px-4 py-3 text-left font-medium">Visits</th>
                <th className="px-4 py-3 text-left font-medium">Conversions</th>
                <th className="px-4 py-3 text-left font-medium">Conversion Rate</th>
                <th className="px-4 py-3 text-left font-medium">Last Activity</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <TableLoadingState colSpan={10} title="Loading campaigns..." />
              ) : campaigns.length === 0 ? (
                <TableEmptyStateRow
                  colSpan={10}
                  title="No campaigns yet"
                  description="Create your first campaign to start tracking field activity."
                  icon={<HugeiconsIcon icon={FileEmpty02Icon} size={40} strokeWidth={1.5} />}
                />
              ) : (
                campaigns.map((campaign) => (
                  <tr key={campaign.id} className="border-t border-border">
                    <td className="px-4 py-4">
                      <p className="font-medium">{campaign.name}</p>
                      <p className="text-xs text-muted-foreground">{campaign.campaign_type ?? campaign.description ?? "No description"}</p>
                    </td>
                    <td className="px-4 py-4 text-muted-foreground">{[campaign.lga, campaign.state].filter(Boolean).join(", ") || "-"}</td>
                    <td className="px-4 py-4 text-muted-foreground">
                      {campaign.start_date ?? "-"} - {campaign.end_date ?? "-"}
                    </td>
                    <td className="px-4 py-4 font-medium">{campaign.assigned_reps_count ?? 0}</td>
                    <td className="px-4 py-4 font-medium">{campaign.visits_count ?? 0}</td>
                    <td className="px-4 py-4 font-medium">{campaign.conversions_count ?? 0}</td>
                    <td className="px-4 py-4">{(campaign.conversion_rate ?? 0).toFixed(1)}%</td>
                    <td className="px-4 py-4 text-muted-foreground">{campaign.last_activity_at ? new Date(campaign.last_activity_at).toLocaleString() : "-"}</td>
                    <td className="px-4 py-4"><StatusBadge status={campaign.status} /></td>
                    <td className="px-4 py-4 text-right">
                      <Button variant="secondary" size="sm" className="rounded-full" asChild>
                        <Link href={`/admin/campaigns/${campaign.id}`}>View</Link>
                      </Button>
                    </td>
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

function StatusBadge({ status }: { status: string }) {
  const className =
    status === "active"
      ? "bg-primary/10 text-primary"
      : status === "draft"
      ? "bg-muted text-muted-foreground"
      : "bg-secondary text-secondary-foreground";

  return <Badge className={`rounded-full hover:bg-inherit ${className}`}>{status}</Badge>;
}
