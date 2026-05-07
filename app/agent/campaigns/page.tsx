"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import SectionHeader from "@/components/agent/SectionHeader";
import { Button } from "@/components/ui/button";
import { authorizedFetch } from "@/lib/api/client";

type Campaign = {
  id: string;
  name: string;
  status: string;
  start_date?: string | null;
  end_date?: string | null;
  state?: string | null;
  lga?: string | null;
};

export default function AgentCampaignsPage() {
  const query = useQuery({
    queryKey: ["agent-campaigns"],
    queryFn: async () => (await authorizedFetch<{ success: boolean; campaigns: Campaign[] }>("/api/agent/campaigns")).campaigns ?? [],
  });
  if (query.error) toast.error((query.error as Error).message);

  return (
    <main className="space-y-4 pt-4">
      <SectionHeader title="My Campaigns" subtitle="Select an active campaign workspace." />
      <section className="space-y-3">
        {(query.data ?? []).map((campaign) => (
          <div key={campaign.id} className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
            <p className="font-medium">{campaign.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">{[campaign.lga, campaign.state].filter(Boolean).join(", ") || "No territory set"}</p>
            <div className="mt-3">
              <Button asChild className="h-9 rounded-full"><Link href={`/agent/campaigns/${campaign.id}`}>Open Workspace</Link></Button>
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}

