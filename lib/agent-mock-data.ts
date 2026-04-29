import type {
  ActivityItem,
  OutletListItem,
  ProfilePreferenceItem,
  SaleListItem,
  SyncQueueItem,
} from "@/types/agent-ui";

export const AGENT_PROFILE = {
  name: "Mathew Ayodele",
  role: "Sales Agent",
  territory: "Lagos Mainland",
  phone: "+234 801 234 9876",
  email: "mathew@fieldops.app",
  todayTarget: "12 visits",
};

export const HOME_METRICS = [
  { label: "Today's Visits", value: "8", delta: "+2 vs yesterday", tone: "blue" as const },
  { label: "Conversions", value: "5", delta: "62% rate", tone: "green" as const },
  { label: "Pending Sync", value: "3", delta: "Needs upload", tone: "amber" as const },
];

export const HOME_ACTIVITIES: ActivityItem[] = [
  {
    id: "act-1",
    title: "BlueMart Outlet",
    subtitle: "Recorded product conversion",
    time: "10:35 AM",
    status: "converted",
  },
  {
    id: "act-2",
    title: "City Choice Store",
    subtitle: "Outlet registration saved",
    time: "09:58 AM",
    status: "pending",
  },
  {
    id: "act-3",
    title: "Prime Corner Shop",
    subtitle: "Photo evidence synced",
    time: "09:22 AM",
    status: "synced",
  },
];

export const OUTLET_LIST: OutletListItem[] = [
  {
    id: "out-1",
    name: "BlueMart Outlet",
    outletType: "Supermarket",
    location: "Yaba, Lagos",
    contactPerson: "M. Danjuma",
    phone: "+234 801 883 1119",
    lastVisit: "Today, 10:35 AM",
    syncStatus: "synced",
  },
  {
    id: "out-2",
    name: "City Choice Store",
    outletType: "Provision Shop",
    location: "Surulere, Lagos",
    contactPerson: "F. Ojo",
    phone: "+234 803 710 4440",
    lastVisit: "Today, 09:58 AM",
    syncStatus: "pending",
  },
  {
    id: "out-3",
    name: "Prime Corner Shop",
    outletType: "Mini Mart",
    location: "Ilupeju, Lagos",
    contactPerson: "B. Adewole",
    phone: "+234 802 470 9281",
    lastVisit: "Yesterday, 04:40 PM",
    syncStatus: "failed",
  },
];

export const SALE_LIST: SaleListItem[] = [
  {
    id: "sale-1",
    outletName: "BlueMart Outlet",
    productName: "Energy Drink 35cl",
    quantity: 12,
    amount: 42000,
    conversionStatus: "converted",
    syncStatus: "synced",
    capturedAt: "10:35 AM",
  },
  {
    id: "sale-2",
    outletName: "City Choice Store",
    productName: "Spark Soda 50cl",
    quantity: 8,
    amount: 25600,
    conversionStatus: "pending",
    syncStatus: "pending",
    capturedAt: "09:58 AM",
  },
  {
    id: "sale-3",
    outletName: "Prime Corner Shop",
    productName: "Fruit Mix 1L",
    quantity: 4,
    amount: 18800,
    conversionStatus: "revisit",
    syncStatus: "failed",
    capturedAt: "Yesterday",
  },
];

export const SYNC_QUEUE: SyncQueueItem[] = [
  {
    id: "sync-1",
    entityType: "sale",
    title: "City Choice Store sale record",
    createdAt: "09:58 AM",
    retries: 1,
    status: "pending",
  },
  {
    id: "sync-2",
    entityType: "photo",
    title: "Prime Corner Shop photo evidence",
    createdAt: "Yesterday",
    retries: 3,
    status: "failed",
  },
  {
    id: "sync-3",
    entityType: "outlet",
    title: "BlueMart metadata update",
    createdAt: "Today",
    retries: 0,
    status: "synced",
  },
];

export const PROFILE_METRICS = [
  { label: "Month Visits", value: "184", delta: "+12%", tone: "blue" as const },
  { label: "Conversion Rate", value: "58%", delta: "+4 pts", tone: "green" as const },
  { label: "Avg Sync Delay", value: "9m", delta: "Improving", tone: "amber" as const },
];

export const PROFILE_PREFERENCES: ProfilePreferenceItem[] = [
  {
    id: "pref-1",
    label: "Offline Save Alerts",
    description: "Show confirmation when records are queued offline.",
    enabled: true,
  },
  {
    id: "pref-2",
    label: "Low GPS Accuracy Warning",
    description: "Prompt when location accuracy is above 30m.",
    enabled: true,
  },
  {
    id: "pref-3",
    label: "Daily Summary Reminder",
    description: "Display summary card at end of day.",
    enabled: false,
  },
];

export const formatNaira = (value: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);
