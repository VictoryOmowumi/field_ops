import { NextRequest, NextResponse } from "next/server";

import { requireSuperAdmin } from "@/lib/platform/server";
import { voidInvoice } from "@/lib/billing/invoice-service";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireSuperAdmin(request);
  if (auth.error) return auth.error;

  const { id } = await context.params;
  try {
    const invoice = await voidInvoice({ invoiceId: id, actorUserId: auth.user.id });
    return NextResponse.json({ success: true, invoice });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to void invoice." },
      { status: 500 }
    );
  }
}
