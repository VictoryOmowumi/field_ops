import { checkCampaignActivationEligibility, type EligibilityReason } from "@/lib/billing/eligibility";
import { getBillingAccountByOrganizationId } from "@/lib/billing/repository";
import { getPlatformSettingValue, writePlatformAuditLog } from "@/lib/platform/server";

export type ActivationGateResult =
  | { blocked: false }
  | { blocked: true; reason: EligibilityReason; blockingInvoiceIds?: string[] };

/**
 * Phase 5: Commercial Activation Gate. Runs at the single choke point every Draft/Completed ->
 * Active transition funnels through (app/api/admin/campaigns/[id]/route.ts).
 *
 * Always evaluates eligibility, even when nothing is enabled — so a "would_block" decision is
 * written to platform_audit_logs from day one. That's the log-only soak period the rollout plan
 * calls for, encoded as the actual default behavior rather than a step someone has to remember
 * to ship first and remove later.
 *
 * Enforcement (an actual 409) only happens when BOTH are true:
 *   - the gate is active for this org: billing_accounts.gating_override, if set, wins outright;
 *     otherwise it falls back to the global commercial.activation.enabled flag
 *   - commercial.activation.log_only is explicitly 'false' (it defaults to 'true')
 */
export async function evaluateActivationGate(input: {
  organizationId: string;
  campaignId: string;
  actorUserId: string;
}): Promise<ActivationGateResult> {
  const eligibility = await checkCampaignActivationEligibility(input.organizationId, input.campaignId);
  if (eligibility.eligible) return { blocked: false };

  const [globalEnabled, logOnlyRaw, billingAccount] = await Promise.all([
    getPlatformSettingValue("commercial.activation.enabled"),
    getPlatformSettingValue("commercial.activation.log_only"),
    getBillingAccountByOrganizationId(input.organizationId),
  ]);

  const gatingOverride = billingAccount?.gating_override ?? null;
  const gateActiveForOrg = gatingOverride === true ? true : gatingOverride === false ? false : globalEnabled === "true";
  const logOnly = logOnlyRaw !== "false";
  const willEnforce = gateActiveForOrg && !logOnly;

  await writePlatformAuditLog({
    actorUserId: input.actorUserId,
    targetType: "campaign_activation_gate",
    targetId: input.campaignId,
    action: willEnforce ? "campaign_activation.blocked" : "campaign_activation.would_block",
    afterState: { reason: eligibility.reason, gateActiveForOrg, logOnly },
  });

  if (!willEnforce) return { blocked: false };
  return {
    blocked: true,
    reason: eligibility.reason,
    blockingInvoiceIds: "blockingInvoiceIds" in eligibility ? eligibility.blockingInvoiceIds : undefined,
  };
}
