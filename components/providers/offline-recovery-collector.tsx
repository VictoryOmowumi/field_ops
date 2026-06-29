"use client";

import { useEffect } from "react";

import { authorizedFetch } from "@/lib/api/client";
import { db } from "@/lib/offline/db";
import type { SyncQueueRecord } from "@/lib/offline/db";

type CollectedItem = {
  campaignId: string | null;
  idempotencyKey: string;
  entityType: SyncQueueRecord["entityType"];
  status: "queued" | "retrying" | "failed_terminal";
  errorMessage: string | null;
  hasOutletDetails: boolean;
  hasEvidenceBlob: boolean;
};

/**
 * Read-only diagnostic collector for the offline-new-outlet bug: scans the local
 * sync queue for stuck visits (failed_terminal/retrying with no outlet_id) and
 * reports counts/metadata so affected agents can be triaged from the backend.
 * Never deletes, modifies, or retries anything in IndexedDB.
 */
export default function OfflineRecoveryCollectorProvider() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!navigator.onLine) return;

    void (async () => {
      try {
        const queue = await db.syncQueue.toArray();
        const queueIds = new Set(queue.map((record) => record.id));

        const stuckVisits = queue.filter((record) => {
          if (record.entityType !== "visit") return false;
          if (record.status !== "failed_terminal" && record.status !== "retrying") return false;
          const payload = record.payload as Record<string, unknown> | null;
          return !payload?.outlet_id;
        });

        if (stuckVisits.length === 0) return;

        const items: CollectedItem[] = stuckVisits.map((record) => {
          const payload = record.payload as Record<string, unknown> | null;
          const hasEmbeddedOutletName =
            typeof payload?.outlet_name === "string" && (payload.outlet_name as string).trim().length > 0;
          const hasLinkedOutletDependency = (record.dependencyIds ?? []).some((depId) => queueIds.has(depId));
          const hasEvidenceBlob = queue.some(
            (other) => other.entityType === "photo" && (other.dependencyIds ?? []).includes(record.id)
          );
          const campaignId =
            record.campaignId ?? (typeof payload?.campaign_id === "string" ? (payload.campaign_id as string) : null);

          return {
            campaignId,
            idempotencyKey: record.idempotencyKey ?? record.id,
            entityType: record.entityType,
            status: (record.status ?? "queued") as CollectedItem["status"],
            errorMessage: record.lastError ?? null,
            hasOutletDetails: hasLinkedOutletDependency || hasEmbeddedOutletName,
            hasEvidenceBlob,
          };
        });

        await authorizedFetch("/api/internal/offline-recovery/report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items }),
        });
      } catch {
        // Best-effort diagnostics only; never surface failures to the agent.
      }
    })();
  }, []);

  return null;
}
