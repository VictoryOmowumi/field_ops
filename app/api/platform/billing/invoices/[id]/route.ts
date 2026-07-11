import { NextRequest, NextResponse } from "next/server";

import { requireSuperAdmin } from "@/lib/platform/server";
import { getCampaignInvoiceById, listCampaignInvoiceLineItems } from "@/lib/billing/repository";
import { updateDraftInvoice } from "@/lib/billing/invoice-service";
import type { InvoiceCategory } from "@/lib/billing/types";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireSuperAdmin(request);
  if (auth.error) return auth.error;

  const { id } = await context.params;
  const invoice = await getCampaignInvoiceById(id);
  if (!invoice) return NextResponse.json({ success: false, message: "Invoice not found." }, { status: 404 });

  const lineItems = await listCampaignInvoiceLineItems(id);
  return NextResponse.json({ success: true, invoice, lineItems });
}

type EditInvoicePayload = {
  invoiceCategory?: InvoiceCategory;
  invoiceSubtype?: string;
  dueDate?: string | null;
  notes?: string | null;
  lineItems?: Array<{ description: string; quantity?: number; unitAmount: number }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireSuperAdmin(request);
  if (auth.error) return auth.error;

  const { id } = await context.params;
  const payload = (await request.json()) as EditInvoicePayload;

  try {
    const invoice = await updateDraftInvoice({ invoiceId: id, actorUserId: auth.user.id, ...payload });
    return NextResponse.json({ success: true, invoice });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to update invoice." },
      { status: 400 }
    );
  }
}
