import type { SyncStatus } from "@/types/sync";

export type ConversionStatus = "converted" | "pending" | "revisit";

export interface Sale {
  id: string;
  outletId: string;
  agentId: string;
  productId: string;
  quantity: number;
  price?: number;
  conversionStatus: ConversionStatus;
  notes?: string;
  latitude?: number;
  longitude?: number;
  locationAccuracy?: number;
  photoIds?: string[];
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
}
