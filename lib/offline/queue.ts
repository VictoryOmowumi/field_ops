import { db, type SyncLogRecord, type SyncQueueRecord } from "@/lib/offline/db";

export async function enqueueSyncRecord(record: SyncQueueRecord) {
  await db.syncQueue.put({ ...record, status: "queued" });
  await appendSyncLog({
    id: `${record.id}-queued-${Date.now()}`,
    queueId: record.id,
    status: "queued",
    timestamp: new Date().toISOString(),
  });
}

export async function getPendingSyncRecords() {
  return db.syncQueue.toArray();
}

export async function removeSyncRecord(id: string) {
  await db.syncQueue.delete(id);
}

export async function appendSyncLog(record: SyncLogRecord) {
  await db.syncLogs.put(record);
}

export function computeNextRetryAt(retryCount: number) {
  const seconds = Math.min(300, 2 ** Math.max(1, retryCount) * 5);
  return new Date(Date.now() + seconds * 1000).toISOString();
}
