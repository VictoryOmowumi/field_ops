import { NextRequest, NextResponse } from "next/server";

import { buildDailySummary } from "@/lib/observability/daily-summary";
import { sendDailyHealthEmail } from "@/lib/observability/alert-email";
import { isInternalRequestAuthorized } from "@/lib/observability/internal-auth";

export async function GET(request: NextRequest) {
  if (!isInternalRequestAuthorized(request)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const summary = await buildDailySummary();

  try {
    await sendDailyHealthEmail(summary);
    return NextResponse.json({ success: true, summary, emailSent: true });
  } catch (error) {
    return NextResponse.json({ success: true, summary, emailSent: false, emailError: (error as Error).message });
  }
}
