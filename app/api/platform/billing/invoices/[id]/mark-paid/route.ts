import { NextRequest, NextResponse } from "next/server";

import { requireSuperAdmin } from "@/lib/platform/server";
import { markInvoicePaid } from "@/lib/billing/invoice-service";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireSuperAdmin(request);
  if (auth.error) return auth.error;

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { externalReference?: string };

  try {
    // Manual approval / bank-transfer confirmation is one payment method among several — this
    // route doesn't know or care whether a future Stripe/Paystack webhook will call the same
    // invoice-service function instead. See docs/architecture/commercial-licensing-architecture.md §3.
    const invoice = await markInvoicePaid({
      invoiceId: id,
      actorUserId: auth.user.id,
      externalReference: body.externalReference ?? null,
    });
    return NextResponse.json({ success: true, invoice });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to mark invoice paid." },
      { status: 500 }
    );
  }
}
