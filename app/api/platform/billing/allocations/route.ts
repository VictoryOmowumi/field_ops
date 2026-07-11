import { NextRequest, NextResponse } from "next/server";

import { requireSuperAdmin } from "@/lib/platform/server";
import { listAllocationsForOrganization } from "@/lib/billing/allocation-service";

export async function GET(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (auth.error) return auth.error;

  const organizationId = request.nextUrl.searchParams.get("organizationId");
  if (!organizationId) {
    return NextResponse.json({ success: false, message: "organizationId query parameter is required." }, { status: 400 });
  }

  const allocations = await listAllocationsForOrganization(organizationId);
  return NextResponse.json({ success: true, allocations });
}
