import { db } from "@/lib/offline/db";

export async function cacheCampaignSnapshot(organizationId: string, campaigns: Array<Record<string, unknown>>) {
  const now = new Date().toISOString();
  await db.campaignsCache.put({
    id: `campaigns-${organizationId}`,
    organizationId,
    createdAt: now,
    campaigns,
  });
}

export async function getCachedCampaignSnapshot(organizationId: string) {
  const row = await db.campaignsCache.get(`campaigns-${organizationId}`);
  return row as { campaigns?: Array<Record<string, unknown>>; createdAt?: string } | undefined;
}

export async function cacheSubmissionSnapshot(organizationId: string, campaignId: string | null, submissions: Array<Record<string, unknown>>) {
  const key = `submissions-${organizationId}-${campaignId ?? "all"}`;
  await db.submissionsCache.put({
    id: key,
    organizationId,
    campaignId,
    createdAt: new Date().toISOString(),
    submissions,
  });
}

export async function getCachedSubmissionSnapshot(organizationId: string, campaignId: string | null) {
  const key = `submissions-${organizationId}-${campaignId ?? "all"}`;
  const row = await db.submissionsCache.get(key);
  return row as { submissions?: Array<Record<string, unknown>>; createdAt?: string } | undefined;
}
