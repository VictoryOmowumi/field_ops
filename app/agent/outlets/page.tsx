"use client";

import { useEffect } from "react";
import { toast } from "sonner";

import ListRowCard from "@/components/agent/ListRowCard";
import SectionHeader from "@/components/agent/SectionHeader";
import StatusPill from "@/components/agent/StatusPill";
import { useAgentBootstrap } from "@/hooks/useAgentBootstrap";

export default function OutletsPage() {
  const query = useAgentBootstrap();
  useEffect(() => {
    if (query.error) toast.error((query.error as Error).message);
  }, [query.error]);

  return (
    <main className="space-y-4 pt-4">
      <SectionHeader title="Outlets" subtitle="Recent known outlets for quick lookup." />
      <section className="space-y-2">
        {(query.data?.recentOutlets ?? []).map((outlet) => (
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
