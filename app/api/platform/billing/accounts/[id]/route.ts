import { NextRequest, NextResponse } from "next/server";

import { requireSuperAdmin } from "@/lib/platform/server";
import {
  getBillingAccountByOrganizationId,
  listCampaignActivationsForOrganization,
  listCampaignInvoicesByBillingAccount,
  listInfrastructureAllocationsByOrganization,
  updateBillingAccount,
} from "@/lib/billing/repository";
import { getOutstandingBalanceForBillingAccount } from "@/lib/billing/invoice-service";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// [id] is the organization id (not the billing_account id), matching the convention already
// used by /api/platform/organizations/[id] and every other org-scoped super-admin route.
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireSuperAdmin(request);
  if (auth.error) return auth.error;

  const { id: organizationId } = await context.params;
  const billingAccount = await getBillingAccountByOrganizationId(organizationId);
  if (!billingAccount) {
    return NextResponse.json({ success: false, message: "No billing account found for this organization." }, { status: 404 });
  }

  const supabase = createServerSupabaseClient();
  const [{ data: organization }, invoices, activations, allocations, outstanding] = await Promise.all([
    supabase.from("organizations").select("id, name, slug, status").eq("id", organizationId).maybeSingle(),
    listCampaignInvoicesByBillingAccount(billingAccount.id),
    listCampaignActivationsForOrganization(organizationId),
    listInfrastructureAllocationsByOrganization(organizationId),
    getOutstandingBalanceForBillingAccount(billingAccount.id),
  ]);

  return NextResponse.json({
    success: true,
    organization,
    billingAccount,
    invoices,
    activations,
    allocations,
    outstandingAmount: outstanding.outstandingAmount,
  });
}

type UpdateBillingAccountPayload = {
  accountStatus?: "in_good_standing" | "past_due" | "suspended" | "closed";
  implementationFeeStatus?: "pending" | "invoiced" | "paid" | "waived";
  billingContactName?: string | null;
  billingContactEmail?: string | null;
  gatingOverride?: boolean | null;
  retentionDays?: number | null;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireSuperAdmin(request);
  if (auth.error) return auth.error;

  const { id: organizationId } = await context.params;
  const billingAccount = await getBillingAccountByOrganizationId(organizationId);
  if (!billingAccount) {
    return NextResponse.json({ success: false, message: "No billing account found for this organization." }, { status: 404 });
  }

  const payload = (await request.json()) as UpdateBillingAccountPayload;
  const updated = await updateBillingAccount(billingAccount.id, payload);

  return NextResponse.json({ success: true, billingAccount: updated });
}
