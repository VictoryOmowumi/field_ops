import { NextRequest, NextResponse } from "next/server";

import { runAlertChecks } from "@/lib/observability/alert-rules";
import { isInternalRequestAuthorized } from "@/lib/observability/internal-auth";

export async function GET(request: NextRequest) {
  if (!isInternalRequestAuthorized(request)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const results = await runAlertChecks();
  return NextResponse.json({ success: true, checkedAt: new Date().toISOString(), results });
}
