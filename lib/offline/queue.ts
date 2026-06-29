import { db, withDbRetry, type SyncLogRecord, type SyncQueueRecord } from "@/lib/offline/db";

export async function enqueueSyncRecord(record: SyncQueueRecord) {
  await withDbRetry(() => db.syncQueue.put({ ...record, status: "queued" }));
  await appendSyncLog({
    id: `${record.id}-queued-${Date.now()}`,
    queueId: record.id,
    status: "queued",
    timestamp: new Date().toISOString(),
  });
}

export async function getPendingSyncRecords() {
  return withDbRetry(() => db.syncQueue.toArray());
}

/**
 * Returns only the records that are actually eligible to sync right now:
 * terminal failures are excluded, retrying records wait for nextRetryAt, and
 * a record whose dependency (e.g. a visit waiting on its outlet) hasn't
 * synced yet is held back rather than attempted out of order. A record whose
 * dependency itself failed terminally can never succeed, so it's cascaded to
 * failed_terminal here instead of being retried forever.
 */
export async function getSyncableRecords(now: Date = new Date()): Promise<SyncQueueRecord[]> {
  const all = await withDbRetry(() => db.syncQueue.toArray());
  const byId = new Map(all.map((item) => [item.id, item]));
  const ready: SyncQueueRecord[] = [];

  for (const item of all) {
    if (item.status === "failed_terminal") continue;
    if (item.status === "retrying" && item.nextRetryAt && new Date(item.nextRetryAt) > now) continue;

    const dependencies = item.dependencyIds ?? [];
    let blockedByFailedDependency = false;
    let waitingOnDependency = false;
    for (const depId of dependencies) {
      const dependency = byId.get(depId);
      if (!dependency) continue; // not in the queue anymore: already synced successfully
      if (dependency.status === "failed_terminal") {
        blockedByFailedDependency = true;
        break;
      }
      waitingOnDependency = true;
    }

    if (blockedByFailedDependency) {
      await failSyncRecord(item.id, "Blocked: a required dependency failed permanently.");
      continue;
    }
    if (waitingOnDependency) continue;

    ready.push(item);
  }

  return ready;
}

export async function failSyncRecord(id: string, message: string) {
  await withDbRetry(() => db.syncQueue.update(id, { status: "failed_terminal", lastError: message, nextRetryAt: undefined }));
  await appendSyncLog({
    id: `${id}-blocked-${Date.now()}`,
    queueId: id,
    status: "failed_terminal",
    message,
    timestamp: new Date().toISOString(),
  });
}

export async function removeSyncRecord(id: string) {
  await withDbRetry(() => db.syncQueue.delete(id));
}

export async function appendSyncLog(record: SyncLogRecord) {
  await withDbRetry(() => db.syncLogs.put(record));
}

export function computeNextRetryAt(retryCount: number) {
  const seconds = Math.min(300, 2 ** Math.max(1, retryCount) * 5);
  return new Date(Date.now() + seconds * 1000).toISOString();
}
