import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getPrimaryOrgMembership } from "@/lib/auth/org-context";
import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { captureException } from "@/lib/observability/sentry";

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
}

const reportItemSchema = z.object({
  campaignId: z.string().uuid().nullable().optional(),
  idempotencyKey: z.string().min(1),
  entityType: z.enum(["outlet", "visit", "sale", "photo"]),
  status: z.enum(["queued", "retrying", "failed_terminal"]),
  errorMessage: z.string().max(500).nullable().optional(),
  hasOutletDetails: z.boolean(),
  hasEvidenceBlob: z.boolean(),
});

const reportBodySchema = z.object({
  items: z.array(reportItemSchema).max(200),
});

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["agent", "admin", "super_admin"])) return forbidden();
  const membership = await getPrimaryOrgMembership(user.id);
  if (!membership) return forbidden();

  const body = await request.json().catch(() => null);
  const parsed = reportBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Invalid offline recovery report payload." }, { status: 400 });
  }

  if (parsed.data.items.length === 0) {
    return NextResponse.json({ success: true, stored: 0 });
  }

  const supabase = createServerSupabaseClient();
  const now = new Date().toISOString();
  const rows = parsed.data.items.map((item) => ({
    user_id: user.id,
    organization_id: membership.organizationId,
    campaign_id: item.campaignId ?? null,
    idempotency_key: item.idempotencyKey,
    entity_type: item.entityType,
    status: item.status,
    error_message: item.errorMessage ?? null,
    has_outlet_details: item.hasOutletDetails,
    has_evidence_blob: item.hasEvidenceBlob,
    last_reported_at: now,
  }));

  const { error } = await supabase
    .from("offline_recovery_reports")
    .upsert(rows, { onConflict: "user_id,idempotency_key,entity_type" });

  if (error) {
    captureException(error, {
      userId: user.id,
      organizationId: membership.organizationId,
      route: "/api/internal/offline-recovery/report",
    });
    return NextResponse.json({ success: false, message: "Failed to store offline recovery report." }, { status: 500 });
  }

  return NextResponse.json({ success: true, stored: rows.length });
}
