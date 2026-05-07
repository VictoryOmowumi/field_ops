import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { getOrgMembershipForUser, hasAllowedOrgRole } from "@/lib/auth/org-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type SettingsPayload = {
  organizationName?: string;
  industry?: string | null;
  contactEmail?: string | null;
  supportPhone?: string | null;
  campaignDefaultType?: string | null;
  defaultTargetPerRep?: number | null;
  requirePhotoEvidence?: boolean;
  requireGpsCapture?: boolean;
  offlineCaptureEnabled?: boolean;
};

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
}

export async function GET(_request: NextRequest) {
  const user = await getAuthenticatedUserFromRequest(_request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["admin", "super_admin"])) return forbidden();

  const membership = await getOrgMembershipForUser(user.id);
  if (!membership || !hasAllowedOrgRole(membership.role, ["org_admin", "supervisor"])) return forbidden();

  const supabase = createServerSupabaseClient();
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id, name, industry, primary_contact_email, support_phone, campaign_default_type, default_target_per_rep, require_photo_evidence, require_gps_capture, offline_capture_enabled")
    .eq("id", membership.organizationId)
    .maybeSingle();

  if (orgError || !org) return NextResponse.json({ success: false, message: orgError?.message ?? "Organization not found." }, { status: 404 });

  return NextResponse.json({ success: true, settings: org });
}

export async function PATCH(request: NextRequest) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["admin", "super_admin"])) return forbidden();

  const membership = await getOrgMembershipForUser(user.id);
  if (!membership || !hasAllowedOrgRole(membership.role, ["org_admin"])) return forbidden();

  const payload = (await request.json()) as SettingsPayload;
  const supabase = createServerSupabaseClient();

  const patch: Record<string, unknown> = {};
  if (payload.organizationName !== undefined) patch.name = payload.organizationName;
  if (payload.industry !== undefined) patch.industry = payload.industry;
  if (payload.contactEmail !== undefined) patch.primary_contact_email = payload.contactEmail;
  if (payload.supportPhone !== undefined) patch.support_phone = payload.supportPhone;
  if (payload.campaignDefaultType !== undefined) patch.campaign_default_type = payload.campaignDefaultType;
  if (payload.defaultTargetPerRep !== undefined) patch.default_target_per_rep = payload.defaultTargetPerRep;
  if (payload.requirePhotoEvidence !== undefined) patch.require_photo_evidence = payload.requirePhotoEvidence;
  if (payload.requireGpsCapture !== undefined) patch.require_gps_capture = payload.requireGpsCapture;
  if (payload.offlineCaptureEnabled !== undefined) patch.offline_capture_enabled = payload.offlineCaptureEnabled;

  const { data, error } = await supabase
    .from("organizations")
    .update(patch)
    .eq("id", membership.organizationId)
    .select("id, name, industry, primary_contact_email, support_phone, campaign_default_type, default_target_per_rep, require_photo_evidence, require_gps_capture, offline_capture_enabled")
    .single();

  if (error || !data) return NextResponse.json({ success: false, message: error?.message ?? "Failed to update settings." }, { status: 500 });
  return NextResponse.json({ success: true, settings: data });
}

