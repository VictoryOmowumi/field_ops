"use client";

import { toast } from "sonner";

import ListRowCard from "@/components/agent/ListRowCard";
import MetricCard from "@/components/agent/MetricCard";
import SectionHeader from "@/components/agent/SectionHeader";
import StatusPill from "@/components/agent/StatusPill";
import { Button } from "@/components/ui/button";
import { SYNC_QUEUE } from "@/lib/agent-mock-data";

export default function SyncPage() {
  const pending = SYNC_QUEUE.filter((item) => item.status === "pending").length;
  const synced = SYNC_QUEUE.filter((item) => item.status === "synced").length;
  const failed = SYNC_QUEUE.filter((item) => item.status === "failed").length;

  return (
    <main className="space-y-4 pt-4">
      <SectionHeader title="Sync Queue" subtitle="Review pending records and trigger retries." />

      <section className="grid grid-cols-3 gap-3">
        <MetricCard label="Pending" value={String(pending)} delta="Awaiting network" tone="amber" />
        <MetricCard label="Synced" value={String(synced)} delta="Uploaded successfully" tone="green" />
        <MetricCard label="Failed" value={String(failed)} delta="Needs retry" tone="blue" />
      </section>

      <section className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          className="h-10 rounded-2xl"
          onClick={() => toast.success("Manual sync started (mock).")}
        >
          Manual Sync
        </Button>
        <Button
          className="h-10 rounded-2xl"
          onClick={() => toast.message("Retrying failed items (mock).")}
        >
          Retry Failed
        </Button>
      </section>

      <section className="space-y-2">
        {SYNC_QUEUE.map((item) => (
          <ListRowCard
            key={item.id}
            title={item.title}
            subtitle={`${item.entityType.toUpperCase()} • retries: ${item.retries}`}
            meta={item.createdAt}
            trailing={<StatusPill status={item.status} />}
          />
        ))}
      </section>
    </main>
  );
}
