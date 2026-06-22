import { NextRequest, NextResponse } from "next/server";

import { recordSystemEvent } from "@/lib/observability/system-events";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { method?: "email" | "phone"; reason?: string } | null;

  await recordSystemEvent({
    eventType: "login_failed",
    severity: "warning",
    message: body?.reason ?? "Login failed",
    metadata: { method: body?.method ?? "email" },
  });

  return NextResponse.json({ success: true });
}
