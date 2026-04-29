import type { SyncStatus } from "@/types/sync";

export interface Outlet {
  id: string;
  name: string;
  outletType?: string;
  contactPerson?: string;
  phone?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  locationAccuracy?: number;
  createdBy: string;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
}
