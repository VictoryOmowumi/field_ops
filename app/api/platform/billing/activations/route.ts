import { NextRequest, NextResponse } from "next/server";

import { requireSuperAdmin } from "@/lib/platform/server";
import { listCampaignActivations } from "@/lib/billing/repository";
import type { ActivationStatus } from "@/lib/billing/types";

const VALID_STATUSES: ActivationStatus[] = ["pending_approval", "approved", "rejected", "active", "expired"];

export async function GET(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (auth.error) return auth.error;

  const statusParam = request.nextUrl.searchParams.get("status");
  const status = statusParam && VALID_STATUSES.includes(statusParam as ActivationStatus)
    ? (statusParam as ActivationStatus)
    : "pending_approval";

  const activations = await listCampaignActivations({ status });
  return NextResponse.json({ success: true, activations });
}
