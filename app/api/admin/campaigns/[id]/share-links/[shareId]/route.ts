import { NextRequest, NextResponse } from "next/server";

import { getOrgMembershipForUser, hasAllowedOrgRole } from "@/lib/auth/org-access";
import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string; shareId: string }> };

type PatchPayload = {
  action?: "revoke";
  expiresAt?: string;
};

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["admin", "super_admin"])) return forbidden();
  const membership = await getOrgMembershipForUser(user.id);
  if (!membership || !hasAllowedOrgRole(membership.role, ["org_admin", "supervisor"])) return forbidden();

  const { id, shareId } = await context.params;
  const payload = (await request.json()) as PatchPayload;
  const supabase = createServerSupabaseClient();

  const patch: Record<string, unknown> = {};
  if (payload.action === "revoke") {
    patch.status = "revoked";
    patch.revoked_at = new Date().toISOString();
  }
  if (payload.expiresAt) {
    const expiresAt = new Date(payload.expiresAt);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      return NextResponse.json({ success: false, message: "Invalid expiry date." }, { status: 400 });
    }
    patch.expires_at = expiresAt.toISOString();
    if (payload.action !== "revoke") {
      patch.status = "active";
      patch.revoked_at = null;
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ success: false, message: "No update operation supplied." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("campaign_share_links")
    .update(patch)
    .eq("id", shareId)
    .eq("campaign_id", id)
    .eq("organization_id", membership.organizationId)
    .select("id, campaign_id, recipient_email, status, expires_at, revoked_at, last_viewed_at, view_count, created_at")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ success: false, message: error?.message ?? "Share link not found." }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    shareLink: {
      id: data.id,
      campaignId: data.campaign_id,
      recipientEmail: data.recipient_email,
      status: data.status,
      expiresAt: data.expires_at,
      revokedAt: data.revoked_at,
      lastViewedAt: data.last_viewed_at,
      viewCount: data.view_count ?? 0,
      createdAt: data.created_at,
    },
  });
}

