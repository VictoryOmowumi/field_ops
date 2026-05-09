"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import AgentBackButton from "@/components/agent/AgentBackButton";
import SectionHeader from "@/components/agent/SectionHeader";
import { Button } from "@/components/ui/button";
import { authorizedFetch } from "@/lib/api/client";

type CampaignResponse = {
  id: string;
  name: string;
  state?: string | null;
  lga?: string | null;
  start_date?: string | null;
  end_date?: string | null;
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

export default function AgentCampaignWorkspacePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const query = useQuery({
    queryKey: ["agent-campaign", id],
    queryFn: async () => (await authorizedFetch<{ success: boolean; campaign: CampaignResponse }>(`/api/agent/campaigns/${id}`)).campaign,
  });
  if (query.error) toast.error((query.error as Error).message);
  const campaign = query.data;

  const submissionsQuery = useQuery({
    queryKey: ["agent-campaign-submissions", id],
    queryFn: async () =>
      (
        await authorizedFetch<{ success: boolean; submissions: SubmissionRow[] }>(
          `/api/agent/submissions?campaignId=${id}`
        )
      ).submissions ?? [],
  });
  if (submissionsQuery.error) toast.error((submissionsQuery.error as Error).message);

  return (
    <main className="space-y-4 pt-4">
      <AgentBackButton href="/agent/campaigns" />
      <SectionHeader title={campaign?.name ?? "Campaign"} subtitle="Campaign workspace" />
      <section className="grid grid-cols-3 gap-3">
        <Stat label="Visits Today" value={String(campaign?.stats.visitsToday ?? 0)} />
        <Stat label="Conversions" value={String(campaign?.stats.conversions ?? 0)} />
        <Stat label="Pending/Revisit" value={String(campaign?.stats.pendingOrRevisit ?? 0)} />
      </section>
          <Button asChild className="mt-4 w-full rounded-full">
            <Link href={`/agent/campaigns/${id}/visit/start`}>
              {campaign?.stats.visitsToday ? "Continue Visit" : "Start Visit"}
            </Link>
          </Button>
     

      <section className="">
        <h2 className="text-sm font-medium">Recent Submissions</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Latest captured visits for this campaign.
        </p>
        <div className="mt-3 space-y-2">
          {(submissionsQuery.data ?? []).slice(0, 3).map((item) => (
            <Link key={item.id} href={`/agent/sales/${item.id}`} className="block rounded-2xl border border-border/70 bg-background p-3">
              <div className="flex justify-between">
              <p className="text-sm font-medium">{item.outlet}</p>
              <p className=" text-xs text-muted-foreground">
                {new Date(item.createdAt).toLocaleString()}
              </p>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatTaskLabel(item.taskType)} · {item.outcomeLabel || formatOutcomeLabel(item.outcome)}
              </p>
            </Link>
          ))}
          {(submissionsQuery.data ?? []).length === 0 ? (
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
