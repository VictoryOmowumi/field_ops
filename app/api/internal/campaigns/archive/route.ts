import { NextRequest, NextResponse } from "next/server";

import { isInternalRequestAuthorized } from "@/lib/observability/internal-auth";
import { getPlatformSettingValue } from "@/lib/platform/server";
import { runArchivalScheduler } from "@/lib/billing/archival-scheduler";

// Cron-triggered (see vercel.json). Always respects commercial.archive.enabled itself — the mode
// is never taken from the caller, so this endpoint can't be used to force a live run before the
// flag says it's safe to. Defaults to dry_run (candidate-logging only) whenever the flag is
// anything other than exactly 'true'.
export async function GET(request: NextRequest) {
  if (!isInternalRequestAuthorized(request)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const archiveEnabled = await getPlatformSettingValue("commercial.archive.enabled");
  const mode = archiveEnabled === "true" ? "live" : "dry_run";
  const result = await runArchivalScheduler({ mode });

  return NextResponse.json({ success: true, ranAt: new Date().toISOString(), ...result });
}
