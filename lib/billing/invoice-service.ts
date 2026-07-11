import {
  createCampaignInvoice,
  getCampaignInvoiceById,
  listCampaignInvoicesByBillingAccount,
  replaceCampaignInvoiceLineItems,
  updateCampaignInvoice,
} from "@/lib/billing/repository";
import { INVOICE_SUBTYPES, type CampaignInvoiceRow, type InvoiceCategory } from "@/lib/billing/types";
import { writePlatformAuditLog } from "@/lib/platform/server";

/**
 * Invoice creation and payment recording. Provider-agnostic: payment method is a field on the
 * invoice/connection, never a branch in this file. No pricing logic reaches into CampaignActivation
 * (see docs/architecture/commercial-licensing-architecture.md §3 — pricing lives here, not on the
 * activation record).
 */
export async function createInvoice(input: {
  billingAccountId: string;
  campaignActivationId?: string | null;
  invoiceCategory: InvoiceCategory;
  invoiceSubtype: string;
  currency?: string;
  dueDate?: string | null;
  notes?: string | null;
  createdBy?: string | null;
  lineItems: Array<{ description: string; quantity?: number; unitAmount: number }>;
}): Promise<CampaignInvoiceRow> {
  if (!INVOICE_SUBTYPES.includes(input.invoiceSubtype as (typeof INVOICE_SUBTYPES)[number])) {
    throw new Error(
      `Unknown invoice subtype "${input.invoiceSubtype}". Known subtypes: ${INVOICE_SUBTYPES.join(", ")}.`
    );
  }
  if (!input.lineItems.length) {
    throw new Error("An invoice requires at least one line item.");
  }

  const invoice = await createCampaignInvoice(input);

  if (input.createdBy) {
    await writePlatformAuditLog({
      actorUserId: input.createdBy,
      targetType: "campaign_invoice",
      targetId: invoice.id,
      action: "campaign_invoice.create",
      afterState: { invoice_subtype: invoice.invoice_subtype, amount: invoice.amount, status: invoice.status },
    });
  }

  return invoice;
}

export async function markInvoicePaid(input: {
  invoiceId: string;
  actorUserId: string;
  paymentProviderConnectionId?: string | null;
  externalReference?: string | null;
}) {
  const invoice = await updateCampaignInvoice(input.invoiceId, {
    status: "paid",
    paidAt: new Date().toISOString(),
    paymentProviderConnectionId: input.paymentProviderConnectionId ?? null,
    externalReference: input.externalReference ?? null,
  });

  await writePlatformAuditLog({
    actorUserId: input.actorUserId,
    targetType: "campaign_invoice",
    targetId: invoice.id,
    action: "campaign_invoice.mark_paid",
    afterState: { status: invoice.status, paid_at: invoice.paid_at },
  });

  return invoice;
}

export async function voidInvoice(input: { invoiceId: string; actorUserId: string }) {
  const invoice = await updateCampaignInvoice(input.invoiceId, { status: "void" });
  await writePlatformAuditLog({
    actorUserId: input.actorUserId,
    targetType: "campaign_invoice",
    targetId: invoice.id,
    action: "campaign_invoice.void",
    afterState: { status: invoice.status },
  });
  return invoice;
}

// draft -> sent is the transition that makes an invoice visible to the org (org admin's billing
// view filters out draft and void entirely — see app/api/admin/billing/route.ts). Nothing else
// changes; sent isn't "paid" and isn't counted differently from draft anywhere except that filter.
export async function markInvoiceSent(input: { invoiceId: string; actorUserId: string }) {
  const invoice = await updateCampaignInvoice(input.invoiceId, { status: "sent" });
  await writePlatformAuditLog({
    actorUserId: input.actorUserId,
    targetType: "campaign_invoice",
    targetId: invoice.id,
    action: "campaign_invoice.mark_sent",
    afterState: { status: invoice.status },
  });
  return invoice;
}

/**
 * Only ever allowed while the invoice is still a draft — once it's sent, paid, or voided, the
 * record needs to stay exactly as it was communicated/settled. Replaces the full line-item set
 * rather than patching individual items.
 */
export async function updateDraftInvoice(input: {
  invoiceId: string;
  actorUserId: string;
  invoiceCategory?: InvoiceCategory;
  invoiceSubtype?: string;
  dueDate?: string | null;
  notes?: string | null;
  lineItems?: Array<{ description: string; quantity?: number; unitAmount: number }>;
}) {
  const current = await getCampaignInvoiceById(input.invoiceId);
  if (!current) throw new Error("Invoice not found.");
  if (current.status !== "draft") {
    throw new Error("Only draft invoices can be edited.");
  }
  if (input.invoiceSubtype && !INVOICE_SUBTYPES.includes(input.invoiceSubtype as (typeof INVOICE_SUBTYPES)[number])) {
    throw new Error(
      `Unknown invoice subtype "${input.invoiceSubtype}". Known subtypes: ${INVOICE_SUBTYPES.join(", ")}.`
    );
  }
  if (input.lineItems && input.lineItems.length === 0) {
    throw new Error("An invoice requires at least one line item.");
  }

  if (input.lineItems) {
    await replaceCampaignInvoiceLineItems(input.invoiceId, input.lineItems);
  }
  const invoice = await updateCampaignInvoice(input.invoiceId, {
    invoiceCategory: input.invoiceCategory,
    invoiceSubtype: input.invoiceSubtype,
    dueDate: input.dueDate,
    notes: input.notes,
  });

  await writePlatformAuditLog({
    actorUserId: input.actorUserId,
    targetType: "campaign_invoice",
    targetId: invoice.id,
    action: "campaign_invoice.edit_draft",
    beforeState: { invoice_subtype: current.invoice_subtype, amount: current.amount },
    afterState: { invoice_subtype: invoice.invoice_subtype, amount: invoice.amount },
  });
  return invoice;
}

export async function getOutstandingBalanceForBillingAccount(billingAccountId: string) {
  const invoices = await listCampaignInvoicesByBillingAccount(billingAccountId);
  const outstanding = invoices.filter((invoice) => invoice.status === "sent" || invoice.status === "overdue");
  return {
    outstandingAmount: outstanding.reduce((sum, invoice) => sum + invoice.amount, 0),
    outstandingInvoiceIds: outstanding.map((invoice) => invoice.id),
  };
}
