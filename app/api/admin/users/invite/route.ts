import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { getOrgMembershipForUser, hasAllowedOrgRole } from "@/lib/auth/org-access";
import { normalizePhoneToE164, getDefaultPasswordForPhone } from "@/lib/auth/phone";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildTenantBaseUrl } from "@/lib/tenant/url";

type InvitePayload = {
  fullName: string;
  email?: string;
  phone?: string;
  role: "org_admin" | "supervisor" | "agent";
};

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
}

function badRequest(message: string) {
  return NextResponse.json({ success: false, message }, { status: 400 });
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["admin", "super_admin"])) return forbidden();

  const membership = await getOrgMembershipForUser(user.id);
  if (!membership || !hasAllowedOrgRole(membership.role, ["org_admin"])) return forbidden();

  const payload = (await request.json()) as Partial<InvitePayload>;
  if (!payload.fullName?.trim()) return badRequest("Full name is required.");
  if (!payload.email?.trim() && !payload.phone?.trim()) return badRequest("Provide at least an email or a phone number.");
  if (!payload.role) return badRequest("Role is required.");
  if (!["org_admin", "supervisor", "agent"].includes(payload.role)) return badRequest("Invalid role.");

  let normalizedPhone: string | null = null;
  if (payload.phone?.trim()) {
    normalizedPhone = normalizePhoneToE164(payload.phone.trim());
    if (!normalizedPhone) return badRequest("Enter a valid phone number.");
  }

  const supabase = createServerSupabaseClient();
  const email = payload.email?.trim().toLowerCase() || null;
  const fullName = payload.fullName.trim();
  const nowIso = new Date().toISOString();
  const appRole = payload.role === "agent" ? "agent" : "admin";

  let invitedUserId: string;
  let memberStatus: "invited" | "active" = "active";
  let acceptedAt: string | null = nowIso;
  let inviteSentAt: string | null = null;

  if (email) {
    const { data: organization } = await supabase
      .from("organizations")
      .select("slug, subdomain")
      .eq("id", membership.organizationId)
      .maybeSingle();
    const orgSlug = organization?.slug?.trim();
    const baseUrl = buildTenantBaseUrl(organization?.subdomain, process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");
    const redirectTo = `${baseUrl}/accept-invite${orgSlug ? `?org=${encodeURIComponent(orgSlug)}` : ""}`;

    const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: { role: appRole, org_role: payload.role },
      redirectTo,
    });

    if (inviteError || !inviteData.user) {
      return NextResponse.json({ success: false, message: inviteError?.message ?? "Failed to invite user." }, { status: 500 });
    }

    invitedUserId = inviteData.user.id;
    memberStatus = "invited";
    acceptedAt = null;
    inviteSentAt = nowIso;

    if (normalizedPhone) {
      const { error: phoneLinkError } = await supabase.auth.admin.updateUserById(invitedUserId, {
        phone: normalizedPhone,
        phone_confirm: true,
      });
      if (phoneLinkError) {
        return NextResponse.json({ success: false, message: `Failed to link phone number: ${phoneLinkError.message}` }, { status: 500 });
      }
    }
  } else {
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      phone: normalizedPhone!,
      phone_confirm: true,
      password: getDefaultPasswordForPhone(normalizedPhone!),
      app_metadata: { role: appRole, org_role: payload.role },
      user_metadata: { full_name: fullName, role: appRole },
    });
    if (createError || !created.user) {
      return NextResponse.json({ success: false, message: createError?.message ?? "Failed to create user." }, { status: 500 });
    }
    invitedUserId = created.user.id;
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .upsert(
      {
        user_id: invitedUserId,
        full_name: fullName,
        email,
        phone: normalizedPhone,
        auth_method: email ? "email" : "phone",
        phone_verified_at: normalizedPhone ? nowIso : null,
        must_change_password: !email && !!normalizedPhone,
        updated_at: nowIso,
      },
      { onConflict: "user_id" }
    );

  if (profileError) {
    return NextResponse.json({ success: false, message: profileError.message }, { status: 500 });
  }

  const { error: memberError } = await supabase
    .from("organization_users")
    .upsert(
      {
        organization_id: membership.organizationId,
        user_id: invitedUserId,
        role: payload.role,
        status: memberStatus,
        invite_sent_at: inviteSentAt,
        accepted_at: acceptedAt,
        updated_at: nowIso,
      },
      { onConflict: "organization_id,user_id" }
    );

  if (memberError) {
    return NextResponse.json({ success: false, message: memberError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, userId: invitedUserId });
}
