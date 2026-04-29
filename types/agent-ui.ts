export type UiSyncStatus = "synced" | "pending" | "failed" | "online" | "offline";
export type UiConversionStatus = "converted" | "pending" | "revisit";

export interface ActivityItem {
  id: string;
  title: string;
  subtitle: string;
  time: string;
  status: UiSyncStatus | UiConversionStatus;
}

export interface OutletListItem {
  id: string;
  name: string;
  outletType: string;
  location: string;
  contactPerson: string;
  phone: string;
  lastVisit: string;
  syncStatus: UiSyncStatus;
}

export interface SaleListItem {
  id: string;
  outletName: string;
  productName: string;
  quantity: number;
  amount: number;
  conversionStatus: UiConversionStatus;
  syncStatus: UiSyncStatus;
  capturedAt: string;
}

export interface SyncQueueItem {
  id: string;
  entityType: "outlet" | "sale" | "photo";
  title: string;
  createdAt: string;
  retries: number;
  status: UiSyncStatus;
}

export interface ProfilePreferenceItem {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
}
