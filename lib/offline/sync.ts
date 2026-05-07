import type { SyncQueueRecord } from "@/lib/offline/db";
import { authorizedFetch } from "@/lib/api/client";
import { appendSyncLog, computeNextRetryAt } from "@/lib/offline/queue";
import { db } from "@/lib/offline/db";

export async function syncRecord(record: SyncQueueRecord) {
  try {
    const result = await authorizedFetch<{
      success: boolean;
      results: Array<{
        idempotencyKey: string;
        status: "synced" | "duplicate" | "failed_retryable" | "failed_terminal";
        message?: string;
      }>;
    }>("/api/agent/sync/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [
          {
            entityType: record.entityType,
            idempotencyKey: record.idempotencyKey ?? record.id,
            payload: record.payload,
          },
        ],
      }),
    });

    const item = result.results[0];
    if (!item || item.status === "failed_retryable" || item.status === "failed_terminal") {
      const retryCount = (record.retryCount ?? 0) + 1;
      const terminal = item?.status === "failed_terminal" || retryCount >= 5;
      await db.syncQueue.update(record.id, {
        retryCount,
        status: terminal ? "failed_terminal" : "retrying",
        lastError: item?.message ?? "Unknown sync error.",
        nextRetryAt: terminal ? undefined : computeNextRetryAt(retryCount),
      });
      await appendSyncLog({
        id: `${record.id}-${Date.now()}`,
        queueId: record.id,
        status: terminal ? "failed_terminal" : "failed_retryable",
        message: item?.message,
        timestamp: new Date().toISOString(),
      });
      return { id: record.id, success: false, status: terminal ? "failed_terminal" : "failed_retryable" as const };
    }

    await db.syncQueue.delete(record.id);
    await appendSyncLog({
      id: `${record.id}-${Date.now()}`,
      queueId: record.id,
      status: item.status,
      message: item.message,
      timestamp: new Date().toISOString(),
    });
    return { id: record.id, success: true, status: item.status };
  } catch (error) {
    const retryCount = (record.retryCount ?? 0) + 1;
    const terminal = retryCount >= 5;
    await db.syncQueue.update(record.id, {
      retryCount,
      status: terminal ? "failed_terminal" : "retrying",
      lastError: (error as Error).message,
      nextRetryAt: terminal ? undefined : computeNextRetryAt(retryCount),
    });
    await appendSyncLog({
      id: `${record.id}-${Date.now()}`,
      queueId: record.id,
      status: terminal ? "failed_terminal" : "failed_retryable",
      message: (error as Error).message,
      timestamp: new Date().toISOString(),
    });
    return { id: record.id, success: false, status: terminal ? "failed_terminal" : "failed_retryable" as const };
  }
}
