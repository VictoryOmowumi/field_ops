import type { SyncQueueRecord } from "@/lib/offline/db";

export async function syncRecord(record: SyncQueueRecord) {
  return {
    id: record.id,
    success: true,
  };
}
