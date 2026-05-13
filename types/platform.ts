export type PlatformIncidentLikeItem = {
  organization: string;
  issue: string;
  severity: "Low" | "Medium" | "High";
  time: string;
};

export type PlatformDashboardSummary = {
  organizations: number;
  activeOrganizations: number;
  totalCampaigns: number;
  totalReps: number;
  syncSuccessRate: string;
  freshnessUnder5Min: string;
  inviteCompletionRate: string;
  organizationSnapshot: Array<{
    id: string;
    name: string;
    status: string;
    totalCampaigns: number;
  }>;
  incidents: PlatformIncidentLikeItem[];
};

export type PlatformCampaignRow = {
  id: string;
  organizationId: string;
  organization: string;
  campaign: string;
  status: string;
  sync: string;
  reps: number;
  outlets: number;
  conversions: number;
};

export type PlatformCampaignDetail = {
  id: string;
  organizationId: string;
  organization: string;
  name: string;
  status: string;
  sync: string;
  description: string;
  startDate: string;
  endDate: string;
  totalSubmissions: number;
  uniqueOutlets: number;
  areasCovered: number;
  conversionRate: number;
  reps: number;
  conversions: number;
  salesValue: number;
  posmChecks: number;
  posmDeployed: number;
  posmUnits: number;
  pendingUploads: number;
  recentActivity: Array<{ rep: string; outlet: string; status: string; time: string }>;
};

export type PlatformUserRow = {
  id: string;
  name: string;
  role: string;
  scope: string;
  status: string;
};

export type PlatformUserDetail = {
  id: string;
  name: string;
  role: string;
  scope: string;
  status: string;
  email: string;
  phone: string;
};

export type PlatformSettingItem = {
  section: "Sync" | "Storage" | "Tenant";
  label: string;
  key: string;
  value: string;
};
