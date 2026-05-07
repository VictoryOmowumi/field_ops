import type { SyncStatus } from "@/types/sync";

export type VisitOutcome =
  | "registered_only"
  | "converted"
  | "no_sale"
  | "pending"
  | "revisit";

export interface Visit {
  id: string;
  organizationId: string;
  campaignId: string;
  outletId: string;
  agentId: string;
  outcome: VisitOutcome;
  noSaleReason?: string;
  followUpDate?: string;
  notes?: string;
  latitude?: number;
  longitude?: number;
  locationAccuracy?: number;
  startedAt: string;
  completedAt?: string;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
}

