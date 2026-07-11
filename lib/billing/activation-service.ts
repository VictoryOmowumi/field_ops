import {
  createCampaignActivation,
  getBillingAccountByOrganizationId,
  getCampaignActivationByCampaignId,
  getCampaignActivationById,
  insertCampaignActivationHistory,
  updateCampaignActivationStatus,
} from "@/lib/billing/repository";
import { writePlatformAuditLog } from "@/lib/platform/server";

/**
 * Ensures a campaign has a CampaignActivation row (pending_approval) the moment it exists, so
 * the Super Admin approval queue (Phase 3) is populated for every campaign — not only the
 * backfilled historical ones. Idempotent: safe to call more than once for the same campaign.
 *
 * This does NOT gate anything — no eligibility check runs here. That's Phase 5.
 */
export async function ensurePendingActivation(input: { campaignId: string; organizationId: string }) {
  const existing = await getCampaignActivationByCampaignId(input.campaignId);
  if (existing) return existing;

  const billingAccount = await getBillingAccountByOrganizationId(input.organizationId);
  if (!billingAccount) {
    throw new Error(
      `No billing account found for organization ${input.organizationId} — cannot create campaign activation.`
    );
  }

  const activation = await createCampaignActivation({
    campaignId: input.campaignId,
    billingAccountId: billingAccount.id,
    activationStatus: "pending_approval",
  });

  await insertCampaignActivationHistory({
    campaignActivationId: activation.id,
    fromStatus: null,
    toStatus: "pending_approval",
    reason: "campaign created",
  });

  return activation;
}

async function transition(input: {
  campaignActivationId: string;
  toStatus: "approved" | "rejected";
  actorUserId: string;
  reason?: string | null;
}) {
  const current = await getCampaignActivationById(input.campaignActivationId);
  if (!current) throw new Error("Campaign activation not found.");

  const updated = await updateCampaignActivationStatus(input.campaignActivationId, input.toStatus);

  await insertCampaignActivationHistory({
    campaignActivationId: input.campaignActivationId,
    fromStatus: current.activation_status,
    toStatus: input.toStatus,
    actorUserId: input.actorUserId,
    reason: input.reason ?? null,
  });

  // The history row above is the product-facing timeline; this is the platform-wide
  // security/compliance audit trail. Deliberately writing to both rather than one or the other.
  await writePlatformAuditLog({
    actorUserId: input.actorUserId,
    targetType: "campaign_activation",
    targetId: input.campaignActivationId,
    action: input.toStatus === "approved" ? "campaign_activation.approve" : "campaign_activation.reject",
    beforeState: { activation_status: current.activation_status },
    afterState: { activation_status: input.toStatus, reason: input.reason ?? null },
  });

  return updated;
}

export async function approveActivation(input: {
  campaignActivationId: string;
  actorUserId: string;
  reason?: string | null;
}) {
  return transition({ ...input, toStatus: "approved" });
}

export async function rejectActivation(input: {
  campaignActivationId: string;
  actorUserId: string;
  reason: string;
}) {
  if (!input.reason?.trim()) throw new Error("A rejection reason is required.");
  return transition({ ...input, toStatus: "rejected" });
}
