import { NextRequest, NextResponse } from "next/server";

import { requireSuperAdmin } from "@/lib/platform/server";
import { runArchivalScheduler } from "@/lib/billing/archival-scheduler";

// Always dry-run — this exists so ops can see "what would the scheduler archive right now"
// on demand from the console, without waiting for the nightly cron or flipping the enforcement
// flag. It never mutates anything, regardless of commercial.archive.enabled.
export async function GET(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (auth.error) return auth.error;

  const result = await runArchivalScheduler({ mode: "dry_run", actorUserId: auth.user.id });
  return NextResponse.json({ success: true, ...result });
}
