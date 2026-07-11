import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { getOrgMembershipForUser, hasAllowedOrgRole } from "@/lib/auth/org-access";
import { getPlatformSettingValue } from "@/lib/platform/server";
import {
  getBillingAccountByOrganizationId,
  getEvidenceStorageBytesForOrganization,
  listCampaignActivationsForOrganization,
  listCampaignInvoicesByBillingAccount,
  listInfrastructureAllocationsByOrganization,
} from "@/lib/billing/repository";
import { getOutstandingBalanceForBillingAccount } from "@/lib/billing/invoice-service";

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
}

// The org-facing mirror of /api/platform/billing/accounts/[id] — read-only, scoped to the
// caller's own organization via membership rather than a URL parameter. Billing is sensitive
// enough that only org_admin (not supervisor/agent) can see it, tighter than general campaign
// viewing.
export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["admin", "super_admin"])) return forbidden();

  const membership = await getOrgMembershipForUser(user.id);
  if (!membership || !hasAllowedOrgRole(membership.role, ["org_admin"])) return forbidden();

  const billingAccount = await getBillingAccountByOrganizationId(membership.organizationId);
  if (!billingAccount) {
    return NextResponse.json({ success: false, message: "No billing account found for this organization." }, { status: 404 });
  }

  const [invoices, activations, allocations, outstanding, storageBytes, defaultRetentionDaysRaw] = await Promise.all([
    listCampaignInvoicesByBillingAccount(billingAccount.id),
    listCampaignActivationsForOrganization(membership.organizationId),
    listInfrastructureAllocationsByOrganization(membership.organizationId),
    getOutstandingBalanceForBillingAccount(billingAccount.id),
    getEvidenceStorageBytesForOrganization(membership.organizationId),
    getPlatformSettingValue("default_media_retention_days"),
  ]);

  const retentionDays = billingAccount.retention_days ?? Number(defaultRetentionDaysRaw ?? 90);

  // draft and void are never shown to the org — draft isn't "real" yet, and void was a mistake
  // that shouldn't have to be explained to a non-technical org admin. Everything else (sent,
  // paid, overdue) is real commercial history and stays visible.
  const visibleInvoices = invoices.filter((invoice) => invoice.status !== "draft" && invoice.status !== "void");

  return NextResponse.json({
    success: true,
    billingAccount,
    invoices: visibleInvoices,
    activations,
    allocations,
    outstandingAmount: outstanding.outstandingAmount,
    storageBytes,
    retentionDays,
  });
}
