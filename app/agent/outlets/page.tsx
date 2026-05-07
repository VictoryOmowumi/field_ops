"use client";

import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import ListRowCard from "@/components/agent/ListRowCard";
import SectionHeader from "@/components/agent/SectionHeader";
import StatusPill from "@/components/agent/StatusPill";
import { authorizedFetch } from "@/lib/api/client";

type BootstrapOutlet = {
  id: string;
  name: string;
  state?: string;
  lga?: string;
  created_at: string;
};

export default function OutletsPage() {
  const query = useQuery({
    queryKey: ["agent-bootstrap-outlets"],
    queryFn: async () =>
      (await authorizedFetch<{ success: boolean; bootstrap: { recentOutlets: BootstrapOutlet[] } }>("/api/agent/bootstrap")).bootstrap.recentOutlets ?? [],
  });
  if (query.error) toast.error((query.error as Error).message);

  return (
    <main className="space-y-4 pt-4">
      <SectionHeader title="Outlets" subtitle="Recent known outlets for quick lookup." />
      <section className="space-y-2">
        {(query.data ?? []).map((outlet) => (
          <ListRowCard
            key={outlet.id}
            title={outlet.name}
            subtitle={[outlet.lga, outlet.state].filter(Boolean).join(", ") || "No territory"}
            meta={new Date(outlet.created_at).toLocaleString()}
            trailing={<StatusPill status="synced" />}
          />
        ))}
      </section>
    </main>
  );
}

