import { db, type SyncQueueRecord } from "@/lib/offline/db";

export async function enqueueSyncRecord(record: SyncQueueRecord) {
  await db.syncQueue.put(record);
}

export async function getPendingSyncRecords() {
  return db.syncQueue.toArray();
}

export async function removeSyncRecord(id: string) {
  await db.syncQueue.delete(id);
}
