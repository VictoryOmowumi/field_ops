import { NextRequest, NextResponse } from "next/server";

import { requireSuperAdmin } from "@/lib/platform/server";
import { listCampaignInvoicesByBillingAccount } from "@/lib/billing/repository";
import { createInvoice } from "@/lib/billing/invoice-service";
import type { InvoiceCategory } from "@/lib/billing/types";

export async function GET(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (auth.error) return auth.error;

  const billingAccountId = request.nextUrl.searchParams.get("billingAccountId");
  if (!billingAccountId) {
    return NextResponse.json({ success: false, message: "billingAccountId query parameter is required." }, { status: 400 });
  }

  const invoices = await listCampaignInvoicesByBillingAccount(billingAccountId);
  return NextResponse.json({ success: true, invoices });
}

type CreateInvoicePayload = {
  billingAccountId: string;
  campaignActivationId?: string | null;
  invoiceCategory: InvoiceCategory;
  invoiceSubtype: string;
  currency?: string;
  dueDate?: string | null;
  notes?: string | null;
  lineItems: Array<{ description: string; quantity?: number; unitAmount: number }>;
};

export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (auth.error) return auth.error;

  const payload = (await request.json()) as Partial<CreateInvoicePayload>;
  if (!payload.billingAccountId) {
    return NextResponse.json({ success: false, message: "billingAccountId is required." }, { status: 400 });
  }
  if (!payload.invoiceCategory) {
    return NextResponse.json({ success: false, message: "invoiceCategory is required." }, { status: 400 });
  }
  if (!payload.invoiceSubtype) {
    return NextResponse.json({ success: false, message: "invoiceSubtype is required." }, { status: 400 });
  }
  if (!payload.lineItems?.length) {
    return NextResponse.json({ success: false, message: "At least one line item is required." }, { status: 400 });
  }

  try {
    const invoice = await createInvoice({
      billingAccountId: payload.billingAccountId,
      campaignActivationId: payload.campaignActivationId ?? null,
      invoiceCategory: payload.invoiceCategory,
      invoiceSubtype: payload.invoiceSubtype,
      currency: payload.currency,
      dueDate: payload.dueDate ?? null,
      notes: payload.notes ?? null,
      createdBy: auth.user.id,
      lineItems: payload.lineItems,
    });
    return NextResponse.json({ success: true, invoice }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to create invoice." },
      { status: 400 }
    );
  }
}
