"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { HugeiconsIcon } from "@hugeicons/react";
import { CloudSavingDone02Icon } from "@hugeicons/core-free-icons";

import ListRowCard from "@/components/agent/ListRowCard";
import MetricCard from "@/components/agent/MetricCard";
import SectionHeader from "@/components/agent/SectionHeader";
import StatusPill from "@/components/agent/StatusPill";
import AgentBackButton from "@/components/agent/AgentBackButton";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/offline/db";
import { requeueSyncRecord } from "@/lib/offline/queue";
import { drainSyncQueue } from "@/lib/offline/sync";

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
  const [isSyncing, setIsSyncing] = useState(false);
  const pending = items.length;
  const failed = items.filter((item) => item.status === "failed_terminal").length;
  const retrying = items.filter((item) => item.status === "retrying").length;
  const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;

  useEffect(() => {
    void db.syncQueue.toArray().then((rows) => setItems(rows as SyncRow[]));
  }, []);

  async function refreshItems() {
    const rows = await db.syncQueue.toArray();
    setItems(rows as SyncRow[]);
  }

  function reportDrainResult(result: { synced: number; failed: number }) {
    if (result.synced === 0 && result.failed === 0) {
      toast.message("No pending records.");
    } else if (result.synced > 0 && result.failed === 0) {
      toast.success(`Synced ${result.synced} item(s).`);
    } else if (result.synced > 0 && result.failed > 0) {
      toast.warning(`Synced ${result.synced} item(s), ${result.failed} failed.`);
    } else {
      toast.error(`Sync failed. ${result.failed} item(s) could not sync.`);
    }
  }

  // Both buttons drain through drainSyncQueue() - the same
  // getSyncableRecords()-ordered logic BackgroundSyncProvider uses - so
  // outlet -> visit -> photo dependency order is never violated here.
  // The refresh always runs in `finally` so the displayed counts can never
  // go stale relative to IndexedDB, even if a drain pass throws.
  async function manualSync() {
    if (!isOnline) {
      toast.error("You are offline. Reconnect and retry.");
      return;
    }
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const result = await drainSyncQueue();
      reportDrainResult(result);
    } finally {
      await refreshItems();
      setIsSyncing(false);
    }
  }

  async function retryFailed() {
    if (!isOnline) {
      toast.error("You are offline. Reconnect and retry.");
      return;
    }
    if (isSyncing) return;
    // Read live from IndexedDB rather than the `items` state: BackgroundSyncProvider
    // remounts and runs its own drain on every navigation to this page, which can
    // cascade a dependent record to failed_terminal after `items` was captured at
    // mount. Deciding from stale state would silently skip retrying it here.
    const liveRows = await db.syncQueue.toArray();
    const retryTargets = liveRows.filter((item) => item.status === "failed_terminal" || item.status === "retrying");
    if (retryTargets.length === 0) {
      toast.message("No failed records to retry.");
      return;
    }
    setIsSyncing(true);
    try {
      // failed_terminal/retrying records are intentionally excluded from
      // getSyncableRecords() (dead, or still in their backoff window) - a
      // manual retry explicitly re-queues them with a fresh retry budget
      // before draining, rather than reimplementing sync logic here.
      await Promise.all(retryTargets.map((item) => requeueSyncRecord(item.id)));
      const result = await drainSyncQueue();
      reportDrainResult(result);
    } finally {
      await refreshItems();
      setIsSyncing(false);
    }
  }

  return (
    <main className="space-y-4 pt-4">
      <AgentBackButton href="/agent/home" />
      <SectionHeader title="Sync Queue" subtitle="Review pending records and trigger retries." />

      {isOnline && pending === 0 ? (
        <section className="flex flex-col h-[calc(100vh-16rem)] items-center justify-center relative">
          <HugeiconsIcon icon={CloudSavingDone02Icon} size={60} strokeWidth={0.5} className="text-green-500" />
          <h2 className="mt-4 text-lg font-medium">All caught up!</h2>
          <p className="text-sm text-muted-foreground">No pending records to sync.</p>
        </section>
      ) : (
        <>
          <section className="grid grid-cols-3 gap-3">
            <MetricCard label="Queued" value={String(pending)} delta="Awaiting network" tone="amber" />
            <MetricCard label="Retrying" value={String(retrying)} delta="Auto backoff active" tone="blue" />
            <MetricCard label="Failed" value={String(failed)} delta="Needs manual action" tone="green" />
          </section>

          <section className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="h-10 rounded-2xl" onClick={manualSync} disabled={isSyncing}>
              {isSyncing ? "Syncing..." : "Manual Sync"}
            </Button>
            <Button className="h-10 rounded-2xl" onClick={retryFailed} disabled={isSyncing}>
              {isSyncing ? "Syncing..." : "Retry Failed"}
            </Button>
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
