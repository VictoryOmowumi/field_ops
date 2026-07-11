import { NextRequest, NextResponse } from "next/server";

import { requireSuperAdmin } from "@/lib/platform/server";
import { approveActivation } from "@/lib/billing/activation-service";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireSuperAdmin(request);
  if (auth.error) return auth.error;

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { reason?: string };

  try {
    const activation = await approveActivation({
      campaignActivationId: id,
      actorUserId: auth.user.id,
      reason: body.reason ?? null,
    });
    return NextResponse.json({ success: true, activation });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to approve activation." },
      { status: 500 }
    );
  }
}
