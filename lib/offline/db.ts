import Dexie, { type Table } from "dexie";

import type { Outlet } from "@/types/outlet";
import type { Sale } from "@/types/sale";
import type { Visit } from "@/types/visit";

export interface SyncQueueRecord {
  id: string;
  entityType: "outlet" | "visit" | "sale" | "photo";
  entityId: string;
  payload: unknown;
  idempotencyKey?: string;
  organizationId?: string;
  campaignId?: string;
  status?: "queued" | "retrying" | "failed_terminal";
  dependencyIds?: string[];
  clientCreatedAt?: string;
  retryCount: number;
  nextRetryAt?: string;
  lastError?: string;
  createdAt: string;
}

export interface SyncLogRecord {
  id: string;
  queueId: string;
  status: "queued" | "retrying" | "synced" | "failed_retryable" | "failed_terminal" | "duplicate";
  message?: string;
  timestamp: string;
}

export class ActivationIQDB extends Dexie {
  outlets!: Table<Outlet, string>;
  visits!: Table<Visit, string>;
  sales!: Table<Sale, string>;
  syncQueue!: Table<SyncQueueRecord, string>;
  campaignsCache!: Table<Record<string, unknown>, string>;
  submissionsCache!: Table<Record<string, unknown>, string>;
  evidenceBlobs!: Table<{ id: string; queueId: string; fileName: string; fileType: string; blob: Blob; createdAt: string }, string>;
  syncLogs!: Table<SyncLogRecord, string>;

  constructor() {
    super("activationiq_db");
    this.version(3).stores({
      outlets: "id, syncStatus, createdAt, updatedAt",
      visits: "id, campaignId, outletId, agentId, outcome, syncStatus, createdAt, updatedAt",
      sales: "id, visitId, outletId, agentId, syncStatus, createdAt, updatedAt",
      syncQueue: "id, entityType, entityId, retryCount, createdAt, idempotencyKey, status, campaignId, organizationId",
      campaignsCache: "id, organizationId, createdAt",
      submissionsCache: "id, campaignId, organizationId, createdAt",
      evidenceBlobs: "id, queueId, createdAt",
      syncLogs: "id, queueId, status, timestamp",
    });
  }
}

export const db = new ActivationIQDB();
