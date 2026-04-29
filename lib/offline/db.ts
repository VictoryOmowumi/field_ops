import Dexie, { type Table } from "dexie";

import type { Outlet } from "@/types/outlet";
import type { Sale } from "@/types/sale";

export interface SyncQueueRecord {
  id: string;
  entityType: "outlet" | "sale" | "photo";
  entityId: string;
  payload: unknown;
  retryCount: number;
  nextRetryAt?: string;
  createdAt: string;
}

export class FieldOpsDB extends Dexie {
  outlets!: Table<Outlet, string>;
  sales!: Table<Sale, string>;
  syncQueue!: Table<SyncQueueRecord, string>;

  constructor() {
    super("field_ops_db");
    this.version(1).stores({
      outlets: "id, syncStatus, createdAt, updatedAt",
      sales: "id, outletId, agentId, syncStatus, createdAt, updatedAt",
      syncQueue: "id, entityType, entityId, retryCount, createdAt",
    });
  }
}

export const db = new FieldOpsDB();
