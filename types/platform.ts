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
  totalSalesRecords: number;
  evidenceFiles: number;
  evidenceStorageBytes: number;
  evidenceStorageLabel: string;
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

export type PlatformInfraStatus = {
  status: "healthy" | "unhealthy" | "configured" | "not_configured";
  latencyMs?: number;
  message?: string;
};

export type PlatformMonitoringSummary = {
  generatedAt: string;
  apiLatencyMs: number;
  infrastructure: {
    database: PlatformInfraStatus;
    storage: PlatformInfraStatus;
    api: PlatformInfraStatus;
    sentry: PlatformInfraStatus;
  };
  activity: {
    submissionsToday: number;
    submissionsSparkline: number[];
    photosUploadedToday: number;
    photosSparkline: number[];
    activeRepsToday: number;
    activeRepsSparkline: number[];
    failedLoginsToday: number;
    failedLoginsSparkline: number[];
    uploadFailuresToday: number;
    uploadFailuresSparkline: number[];
  };
  errors: Array<{
    id: string;
    createdAt: string;
    severity: string;
    eventType: string;
    message: string;
    organizationId: string | null;
  }>;
  alerts: Array<{
    alertKey: string;
    severity: string;
    subject: string;
    message: string;
  }>;
  auth: {
    successfulLoginsToday: number;
    failedLoginsToday: number;
    failureRate: string;
    topAuthEvents: Array<{ message: string; count: number }>;
  };
  campaignActivity: {
    totalSubmissionsToday: number;
    activeCampaigns: number;
    activeReps: number;
    photosUploaded: number;
    submissionVelocityPerHour: number;
  };
  importTracking: {
    importedRecords: number;
    appCapturedRecords: number;
    importBatches: number;
    importErrors: number;
  };
  performance: {
    avgVisitSubmissionMs: number;
    avgUploadMs: number;
    slowEndpointCount: number;
    slowQueryCount: number;
  };
  costInsights: {
    storage: {
      imageCount: number;
      averageImageSizeBytes: number;
      estimatedMonthlyGrowthBytes: number;
      warningThresholdBytes: number;
      approachingLimit: boolean;
    };
    database: {
      totalRecordsStored: number;
      note: string;
    };
    supabaseDisk: { available: false; note: string };
    vercelUsage: { available: false; note: string };
  };
};

export type PlatformSettingItem = {
  section: "Sync" | "Storage" | "Tenant" | "Commercial";
  label: string;
  key: string;
  value: string;
};
