"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import ListRowCard from "@/components/agent/ListRowCard";
import MetricCard from "@/components/agent/MetricCard";
import SectionHeader from "@/components/agent/SectionHeader";
import StatusPill from "@/components/agent/StatusPill";
import AgentBackButton from "@/components/agent/AgentBackButton";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/offline/db";
import { syncRecord } from "@/lib/offline/sync";

type SyncRow = {
  id: string;
  entityType: "outlet" | "visit" | "sale" | "photo";
  entityId: string;
  payload: unknown;
  createdAt: string;
  retryCount: number;
  status?: "queued" | "retrying" | "failed_terminal";
  nextRetryAt?: string;
};

export default function SyncPage() {
  const [items, setItems] = useState<SyncRow[]>([]);
  const pending = items.length;
  const failed = items.filter((item) => item.status === "failed_terminal").length;
  const retrying = items.filter((item) => item.status === "retrying").length;
  const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;

  useEffect(() => {
    void db.syncQueue.toArray().then((rows) => setItems(rows as SyncRow[]));
  }, []);

  async function runSync(targetItems: SyncRow[]) {
    if (!isOnline) {
      toast.error("You are offline. Reconnect and retry.");
      return;
    }
    if (targetItems.length === 0) {
      toast.message("No pending records.");
      return;
    }
    let successCount = 0;
    let failedCount = 0;
    for (const item of targetItems) {
      const result = await syncRecord(item);
      if (result.success) {
        successCount += 1;
      } else {
        failedCount += 1;
      }
    }
    const remaining = await db.syncQueue.toArray();
    setItems(remaining as SyncRow[]);
    if (successCount > 0 && failedCount === 0) {
      toast.success(`Synced ${successCount} item(s).`);
      return;
    }
    if (successCount > 0 && failedCount > 0) {
      toast.warning(`Synced ${successCount} item(s), ${failedCount} failed.`);
      return;
    }
    toast.error(`Sync failed. ${failedCount} item(s) could not sync.`);
  }

  async function manualSync() {
    await runSync(items);
  }

  async function retryFailed() {
    const failedItems = items.filter((item) => item.status === "failed_terminal" || item.status === "retrying");
    await runSync(failedItems);
  }

  return (
    <main className="space-y-4 pt-4">
      <AgentBackButton href="/agent/home" />
      <SectionHeader title="Sync Queue" subtitle="Review pending records and trigger retries." />

      {isOnline && pending === 0 ? (
        <section className="rounded-2xl border border-emerald-200/70 bg-emerald-50 p-4 text-emerald-900">
          <p className="font-medium">All records synced</p>
          <p className="mt-1 text-sm">You are online and there are no pending uploads.</p>
        </section>
      ) : (
        <>
          <section className="grid grid-cols-3 gap-3">
            <MetricCard label="Queued" value={String(pending)} delta="Awaiting network" tone="amber" />
            <MetricCard label="Retrying" value={String(retrying)} delta="Auto backoff active" tone="blue" />
            <MetricCard label="Failed" value={String(failed)} delta="Needs manual action" tone="green" />
          </section>

          <section className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="h-10 rounded-2xl" onClick={manualSync}>Manual Sync</Button>
            <Button className="h-10 rounded-2xl" onClick={retryFailed}>Retry Failed</Button>
          </section>

          <section className="space-y-2">
            {items.map((item) => (
              <ListRowCard
                key={item.id}
                title={`Queue item ${item.id.slice(0, 8)}`}
                subtitle={`${item.entityType.toUpperCase()} • retries: ${item.retryCount}${item.nextRetryAt ? ` • next: ${new Date(item.nextRetryAt).toLocaleTimeString()}` : ""}`}
                meta={item.createdAt}
                trailing={<StatusPill status={item.status === "failed_terminal" ? "failed" : "pending"} />}
              />
            ))}
          </section>
        </>
      )}
    </main>
  );
}
