import { getBillingAccountByOrganizationId, getCampaignActivationByCampaignId } from "@/lib/billing/repository";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type EligibilityReason =
  | "no_billing_account"
  | "organization_suspended"
  | "no_activation_record"
  | "pending_commercial_approval"
  | "activation_rejected"
  | "activation_expired"
  | "outstanding_invoices";

export type EligibilityResult =
  | { eligible: true }
  | { eligible: false; reason: EligibilityReason; blockingInvoiceIds?: string[] };

/**
 * The single seam between campaign code and the billing domain. Campaign routes call this and
 * act on the verdict — they never query billing tables directly, and this never imports
 * campaign types beyond the two ids it's given. See docs/architecture/commercial-licensing-architecture.md §3.
 *
 * Not wired into any request path yet (that's Phase 5, the Commercial Activation Gate).
 */
export async function checkCampaignActivationEligibility(
  organizationId: string,
  campaignId: string
): Promise<EligibilityResult> {
  const billingAccount = await getBillingAccountByOrganizationId(organizationId);
  if (!billingAccount) {
    return { eligible: false, reason: "no_billing_account" };
  }
  if (billingAccount.account_status === "suspended" || billingAccount.account_status === "closed") {
    return { eligible: false, reason: "organization_suspended" };
  }

  const activation = await getCampaignActivationByCampaignId(campaignId);
  if (!activation) {
    return { eligible: false, reason: "no_activation_record" };
  }
  if (activation.activation_status === "pending_approval") {
    return { eligible: false, reason: "pending_commercial_approval" };
  }
  if (activation.activation_status === "rejected") {
    return { eligible: false, reason: "activation_rejected" };
  }
  if (activation.activation_status === "expired") {
    return { eligible: false, reason: "activation_expired" };
  }

  const supabase = createServerSupabaseClient();
  const { data: overdueInvoices, error } = await supabase
    .from("campaign_invoices")
    .select("id")
    .eq("campaign_activation_id", activation.id)
    .eq("status", "overdue");
  if (error) throw new Error(error.message);
  if (overdueInvoices && overdueInvoices.length > 0) {
    return {
      eligible: false,
      reason: "outstanding_invoices",
      blockingInvoiceIds: overdueInvoices.map((row) => row.id as string),
    };
  }

  return { eligible: true };
}
