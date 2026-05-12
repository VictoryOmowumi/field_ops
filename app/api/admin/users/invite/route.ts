import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { getOrgMembershipForUser, hasAllowedOrgRole } from "@/lib/auth/org-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type InvitePayload = {
  fullName: string;
  email: string;
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
  if (!payload.email?.trim()) return badRequest("Email is required.");
  if (!payload.role) return badRequest("Role is required.");
  if (!["org_admin", "supervisor", "agent"].includes(payload.role)) return badRequest("Invalid role.");

  const supabase = createServerSupabaseClient();
  const email = payload.email.trim().toLowerCase();
  const { data: organization } = await supabase
    .from("organizations")
    .select("slug")
    .eq("id", membership.organizationId)
    .maybeSingle();
  const orgSlug = organization?.slug?.trim();
  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/accept-invite${orgSlug ? `?org=${encodeURIComponent(orgSlug)}` : ""}`;

  const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { role: payload.role === "agent" ? "agent" : "admin", org_role: payload.role },
    redirectTo,
  });

  if (inviteError || !inviteData.user) {
    return NextResponse.json({ success: false, message: inviteError?.message ?? "Failed to invite user." }, { status: 500 });
  }

  const invitedUserId = inviteData.user.id;
  const nowIso = new Date().toISOString();

  const { error: profileError } = await supabase
    .from("profiles")
    .upsert(
      {
        user_id: invitedUserId,
        full_name: payload.fullName.trim(),
        email,
        phone: payload.phone?.trim() || null,
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
        status: "invited",
        invite_sent_at: nowIso,
        accepted_at: null,
        updated_at: nowIso,
      },
      { onConflict: "organization_id,user_id" }
    );

  if (memberError) {
    return NextResponse.json({ success: false, message: memberError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, userId: invitedUserId });
}
