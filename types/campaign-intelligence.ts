export type CampaignAnalyticsSummary = {
  totalSubmissions: number;
  conversions: number;
  convertedOutlets: number;
  salesCount?: number;
  unitsSold?: number;
  achievedVisits: number;
  uniqueOutlets: number;
  areasCovered: number;
  conversionRate: number;
  syncHealth: number;
  posmChecks: number;
  posmDeployed: number;
  posmUnits: number;
  posmDeploymentRate: number;
  plannedFreeSamples?: number;
  distributedFreeSamples?: number;
  remainingFreeSamples?: number;
  freeSampleAchievementRate?: number;
  recentTrend: Array<{ day: string; submissions: number; conversions: number }>;
};

export type CampaignMapPoint = {
  id: string;
  source: "visit" | "sale";
  latitude: number;
  longitude: number;
  outlet: string;
  lga?: string | null;
  agent: string;
  status: string;
  syncStatus: string;
  createdAt: string;
  saleCount?: number;
  saleQuantityTotal?: number;
};

export type CampaignActivityRow = {
  id: string;
  type: "visit" | "sale";
  taskType?: string;
  status: string;
  customer?: string;
  outlet: string;
  outletPhone?: string;
  outletAddress?: string;
  outletStatus?: "Converted" | "Onboarded";
  area?: string;
  products?: string;
  location?: string;
  actor: string;
  createdAt: string;
  taskPayload?: Record<string, unknown> | null;
  saleCount?: number;
  saleLines?: Array<{ id: string; product_name: string | null; quantity: number | null; sales_value?: number | null; conversion_status?: string | null }>;
};

export type CampaignEvidenceItem = {
  id: string;
  visit_id: string;
  outlet: string;
  actor: string;
  created_at: string;
  file_url: string;
  signed_url: string | null;
  file_name?: string | null;
  file_type?: string | null;
  file_size?: number | null;
  original_file_name?: string | null;
  original_file_size?: number | null;
  compressed_file_size?: number | null;
  mime_type?: string | null;
};

export type CampaignEvidencePagination = {
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};

export type ShareLinkStatus = "active" | "revoked" | "expired";

export type CampaignShareLink = {
  id: string;
  campaignId: string;
  recipientEmail: string | null;
  status: ShareLinkStatus;
  expiresAt: string;
  revokedAt: string | null;
  lastViewedAt: string | null;
  viewCount: number;
  createdAt: string;
  shareUrl?: string;
};

export type CampaignShareViewEvent = {
  id: string;
  shareLinkId: string;
  viewedAt: string;
  ipHash: string | null;
  userAgent: string | null;
  referrer: string | null;
};
