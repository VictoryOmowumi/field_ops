import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { getOrgMembershipForUser, hasAllowedOrgRole } from "@/lib/auth/org-access";
import { getBillingAccountByOrganizationId, getCampaignInvoiceById, listCampaignInvoiceLineItems } from "@/lib/billing/repository";

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
}

type RouteContext = { params: Promise<{ id: string }> };

// Read-only, org-scoped invoice detail. Deliberately 404s (not just filters) for draft/void
// invoices or ones belonging to another org — same rule as the list in /api/admin/billing, just
// enforced again here so a guessed invoice ID can't bypass it.
export async function GET(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["admin", "super_admin"])) return forbidden();

  const membership = await getOrgMembershipForUser(user.id);
  if (!membership || !hasAllowedOrgRole(membership.role, ["org_admin"])) return forbidden();

  const billingAccount = await getBillingAccountByOrganizationId(membership.organizationId);
  if (!billingAccount) {
    return NextResponse.json({ success: false, message: "No billing account found for this organization." }, { status: 404 });
  }

  const { id } = await context.params;
  const invoice = await getCampaignInvoiceById(id);
  if (
    !invoice ||
    invoice.billing_account_id !== billingAccount.id ||
    invoice.status === "draft" ||
    invoice.status === "void"
  ) {
    return NextResponse.json({ success: false, message: "Invoice not found." }, { status: 404 });
  }

  const lineItems = await listCampaignInvoiceLineItems(id);
  return NextResponse.json({ success: true, invoice, lineItems });
}
