import type { SyncQueueRecord } from "@/lib/offline/db";
import { authorizedFetch } from "@/lib/api/client";
import { appendSyncLog, computeNextRetryAt, getSyncableRecords } from "@/lib/offline/queue";
import { db } from "@/lib/offline/db";

/**
 * Photo records never go through the generic JSON batch endpoint below — the actual image
 * bytes live locally in db.evidenceBlobs (queued at capture time, see visit/start/page.tsx),
 * and only a placeholder `offline://<queueId>` file_url sits in the sync-queue payload. This
 * pulls the real blob back out and uploads it through the same multipart endpoint the online
 * capture path uses, so visit_evidence.file_url ends up pointing at real storage instead of
 * that placeholder string.
 */
async function syncPhotoRecord(record: SyncQueueRecord) {
  try {
    const payload = record.payload as Record<string, unknown>;
    const visitId = payload.visit_id ? String(payload.visit_id) : "";
    if (!visitId) throw new Error("Visit id is required for evidence sync.");

    const blobRow = await db.evidenceBlobs.where("queueId").equals(record.id).first();
    if (!blobRow) throw new Error("Cached photo data is missing on this device and can't be synced.");

    const formData = new FormData();
    formData.append("file", blobRow.blob, blobRow.fileName);
    formData.append("idempotencyKey", record.idempotencyKey ?? record.id);
    if (typeof payload.original_file_name === "string") formData.append("originalFileName", payload.original_file_name);
    if (typeof payload.original_file_size === "number") formData.append("originalFileSize", String(payload.original_file_size));
    if (typeof payload.compressed_file_size === "number") formData.append("compressedFileSize", String(payload.compressed_file_size));
    if (typeof payload.mime_type === "string") formData.append("mimeType", payload.mime_type);

    await authorizedFetch(`/api/agent/visits/${visitId}/evidence`, {
      method: "POST",
      body: formData,
    });

    await db.evidenceBlobs.delete(blobRow.id);
    await db.syncQueue.delete(record.id);
    await appendSyncLog({
      id: `${record.id}-${Date.now()}`,
      queueId: record.id,
      status: "synced",
      timestamp: new Date().toISOString(),
    });
    return { id: record.id, success: true, status: "synced" as const };
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

export async function syncRecord(record: SyncQueueRecord) {
  if (record.entityType === "photo") return syncPhotoRecord(record);

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

export type DrainSyncResult = {
  synced: number;
  failed: number;
};

/**
 * Single source of truth for draining the sync queue, used by both the
 * background sync provider and the manual sync page. Always pulls the next
 * batch through getSyncableRecords() so outlet -> visit -> photo dependency
 * order is respected. Loops passes (rather than a single pass) so that a
 * one-shot manual "Sync Now" click fully drains a dependency chain in one
 * go instead of only unblocking the next link and waiting for the next tick.
 * Each pass only re-includes a record if it's newly eligible (a dependency
 * just cleared); anything left ineligible (backoff window, terminal) drops
 * out of getSyncableRecords() immediately, so this always terminates within
 * at most maxPasses passes.
 */
export async function drainSyncQueue(maxPasses = 25): Promise<DrainSyncResult> {
  let synced = 0;
  let failed = 0;

  for (let pass = 0; pass < maxPasses; pass += 1) {
    const queue = await getSyncableRecords();
    if (queue.length === 0) break;

    for (const item of queue) {
      const result = await syncRecord(item);
      if (result.success) synced += 1;
      else failed += 1;
    }
  }

  return { synced, failed };
}
