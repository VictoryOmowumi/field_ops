import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getPlatformSettingValue, writePlatformAuditLog } from "@/lib/platform/server";
import { getBillingAccountByOrganizationId } from "@/lib/billing/repository";

export type ArchivalCandidate = {
  campaignId: string;
  campaignName: string;
  organizationId: string;
  completedAt: string;
  retentionDays: number;
  eligibleSince: string;
};

export type ArchivalRunResult = {
  mode: "dry_run" | "live";
  candidateCount: number;
  candidates: ArchivalCandidate[];
  archivedCampaignIds: string[];
};

const DEFAULT_RETENTION_DAYS_FALLBACK = 90;

async function resolveRetentionDays(organizationId: string): Promise<number> {
  const billingAccount = await getBillingAccountByOrganizationId(organizationId);
  if (billingAccount?.retention_days) return billingAccount.retention_days;
  const platformDefault = await getPlatformSettingValue("default_media_retention_days");
  const parsed = Number(platformDefault);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RETENTION_DAYS_FALLBACK;
}

/**
 * Phase 8: finds completed campaigns whose retention window (org override, falling back to the
 * platform default) has elapsed, and — only in 'live' mode — transitions them to 'archived'.
 * 'dry_run' always just reports the candidate list; nothing is ever mutated in that mode. This
 * is the same log-first-then-enforce shape used by the Phase 5 activation gate.
 */
export async function runArchivalScheduler(opts: { mode: "dry_run" | "live"; actorUserId?: string }): Promise<ArchivalRunResult> {
  const supabase = createServerSupabaseClient();
  const { data: completedCampaigns, error } = await supabase
    .from("campaigns")
    .select("id, name, organization_id, completed_at")
    .eq("status", "completed")
    .not("completed_at", "is", null);
  if (error) throw new Error(error.message);

  const now = Date.now();
  const candidates: ArchivalCandidate[] = [];
  for (const campaign of completedCampaigns ?? []) {
    const retentionDays = await resolveRetentionDays(campaign.organization_id);
    const completedAtMs = new Date(campaign.completed_at as string).getTime();
    const eligibleAtMs = completedAtMs + retentionDays * 24 * 60 * 60 * 1000;
    if (now < eligibleAtMs) continue;
    candidates.push({
      campaignId: campaign.id,
      campaignName: campaign.name,
      organizationId: campaign.organization_id,
      completedAt: campaign.completed_at as string,
      retentionDays,
      eligibleSince: new Date(eligibleAtMs).toISOString(),
    });
  }

  const archivedCampaignIds: string[] = [];
  if (opts.mode === "live") {
    for (const candidate of candidates) {
      const { error: updateError } = await supabase
        .from("campaigns")
        .update({ status: "archived", archived_at: new Date().toISOString() })
        .eq("id", candidate.campaignId)
        .eq("status", "completed"); // guard against a race with a manual edit since the query ran
      if (!updateError) archivedCampaignIds.push(candidate.campaignId);
    }
  }

  await writePlatformAuditLog({
    actorUserId: opts.actorUserId ?? "00000000-0000-0000-0000-000000000000",
    targetType: "campaign_archival_scheduler",
    targetId: opts.mode,
    action: opts.mode === "live" ? "archival_scheduler.archived" : "archival_scheduler.dry_run",
    afterState: { candidateCount: candidates.length, archivedCount: archivedCampaignIds.length },
  });

  return { mode: opts.mode, candidateCount: candidates.length, candidates, archivedCampaignIds };
}

export async function forceArchiveCampaign(input: { campaignId: string; actorUserId: string }) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("campaigns")
    .update({ status: "archived", archived_at: new Date().toISOString() })
    .eq("id", input.campaignId)
    .select("id, organization_id, status")
    .single();
  if (error) throw new Error(error.message);

  await writePlatformAuditLog({
    actorUserId: input.actorUserId,
    targetType: "campaign",
    targetId: input.campaignId,
    action: "campaign.force_archived",
  });
  return data;
}

export async function unarchiveCampaign(input: { campaignId: string; actorUserId: string }) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("campaigns")
    .update({ status: "completed", archived_at: null })
    .eq("id", input.campaignId)
    .select("id, organization_id, status")
    .single();
  if (error) throw new Error(error.message);

  await writePlatformAuditLog({
    actorUserId: input.actorUserId,
    targetType: "campaign",
    targetId: input.campaignId,
    action: "campaign.unarchived",
  });
  return data;
}

export async function extendCampaignRetention(input: { organizationId: string; additionalDays: number; actorUserId: string }) {
  const billingAccount = await getBillingAccountByOrganizationId(input.organizationId);
  const platformDefault = Number(await getPlatformSettingValue("default_media_retention_days"));
  const currentRetention =
    billingAccount?.retention_days ?? (Number.isFinite(platformDefault) && platformDefault > 0 ? platformDefault : DEFAULT_RETENTION_DAYS_FALLBACK);
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("billing_accounts")
    .update({ retention_days: currentRetention + input.additionalDays })
    .eq("organization_id", input.organizationId);
  if (error) throw new Error(error.message);

  await writePlatformAuditLog({
    actorUserId: input.actorUserId,
    targetType: "billing_account",
    targetId: input.organizationId,
    action: "billing_account.retention_extended",
    afterState: { retentionDays: currentRetention + input.additionalDays },
  });
}
