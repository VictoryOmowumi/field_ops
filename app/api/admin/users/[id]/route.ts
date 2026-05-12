import { NextRequest, NextResponse } from "next/server";

import { getOrgMembershipForUser, hasAllowedOrgRole } from "@/lib/auth/org-access";
import { extractAppRole } from "@/lib/auth/roles";
import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type UpdateUserPayload = {
  role?: "org_admin" | "supervisor" | "agent";
  status?: "active" | "inactive" | "invited" | "suspended";
};

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
}

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["admin", "super_admin"])) return forbidden();

  const membership = await getOrgMembershipForUser(user.id);
  if (!membership || !hasAllowedOrgRole(membership.role, ["org_admin"])) return forbidden();

  const { id } = await context.params;
  const supabase = createServerSupabaseClient();

  const { data: orgMember, error: orgMemberError } = await supabase
    .from("organization_users")
    .select("id, user_id, role, status, invite_sent_at, accepted_at, organization_id, created_at")
    .eq("organization_id", membership.organizationId)
    .eq("user_id", id)
    .maybeSingle();
  if (orgMemberError || !orgMember) {
    return NextResponse.json({ success: false, message: orgMemberError?.message ?? "User not found." }, { status: 404 });
  }

  const [{ data: profile }, { data: authUserResp }] = await Promise.all([
    supabase.from("profiles").select("full_name, email, phone").eq("user_id", id).maybeSingle(),
    supabase.auth.admin.getUserById(id),
  ]);

  const authUser = authUserResp?.user ?? null;
  const authMetadata = authUser?.user_metadata ?? {};
  const resolvedEmail = profile?.email ?? authUser?.email ?? null;
  const displayName =
    profile?.full_name ??
    (authMetadata.full_name as string | undefined) ??
    (authMetadata.name as string | undefined) ??
    (resolvedEmail ? resolvedEmail.split("@")[0] : "Unnamed User");

  return NextResponse.json({
    success: true,
    user: {
      id: orgMember.user_id,
      membershipId: orgMember.id,
      displayName,
      email: resolvedEmail,
      phone: profile?.phone ?? null,
      organizationRole: orgMember.role,
      appRole: authUser ? extractAppRole(authUser) : null,
      status: orgMember.status,
      inviteSentAt: orgMember.invite_sent_at ?? null,
      acceptedAt: orgMember.accepted_at ?? null,
      lastSignInAt: authUser?.last_sign_in_at ?? null,
      createdAt: orgMember.created_at ?? null,
    },
  });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["admin", "super_admin"])) return forbidden();

  const membership = await getOrgMembershipForUser(user.id);
  if (!membership || !hasAllowedOrgRole(membership.role, ["org_admin"])) return forbidden();

  const { id } = await context.params;
  const payload = (await request.json()) as UpdateUserPayload;
  const supabase = createServerSupabaseClient();

  const { data: targetMembership, error: targetError } = await supabase
    .from("organization_users")
    .select("id, user_id, role, status")
    .eq("organization_id", membership.organizationId)
    .eq("user_id", id)
    .maybeSingle();
  if (targetError || !targetMembership) {
    return NextResponse.json({ success: false, message: targetError?.message ?? "User not found." }, { status: 404 });
  }

  const nextRole = payload.role ?? targetMembership.role;
  const nextStatus = payload.status ?? targetMembership.status;

  if ((targetMembership.role === "org_admin" || nextRole === "org_admin") && (nextRole !== "org_admin" || nextStatus !== "active")) {
    const { count } = await supabase
      .from("organization_users")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", membership.organizationId)
      .eq("role", "org_admin")
      .eq("status", "active");

    const isCurrentTargetOnlyActiveOrgAdmin = (count ?? 0) <= 1 && targetMembership.role === "org_admin" && targetMembership.status === "active";
    if (isCurrentTargetOnlyActiveOrgAdmin) {
      return NextResponse.json({ success: false, message: "You cannot remove or suspend the last active organization admin." }, { status: 400 });
    }
  }

  const patch: Record<string, unknown> = {};
  if (payload.role !== undefined) patch.role = payload.role;
  if (payload.status !== undefined) patch.status = payload.status;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ success: true });
  }

  const { error: updateMembershipError } = await supabase
    .from("organization_users")
    .update(patch)
    .eq("id", targetMembership.id)
    .eq("organization_id", membership.organizationId);

  if (updateMembershipError) {
    return NextResponse.json({ success: false, message: updateMembershipError.message }, { status: 500 });
  }

  const mappedAppRole = nextRole === "agent" ? "agent" : "admin";
  const { data: existingUser } = await supabase.auth.admin.getUserById(id);
  const currentAppMetadata = existingUser.user?.app_metadata ?? {};
  const mergedAppMetadata = { ...currentAppMetadata, role: mappedAppRole, org_role: nextRole };
  await supabase.auth.admin.updateUserById(id, { app_metadata: mergedAppMetadata });

  if (nextRole === "agent") {
    const { data: existingRepProfile } = await supabase
      .from("rep_profiles")
      .select("id")
      .eq("organization_id", membership.organizationId)
      .eq("user_id", id)
      .maybeSingle();

    if (!existingRepProfile) {
      const repCode = `REP-${Date.now().toString().slice(-6)}`;
      const { error: createRepProfileError } = await supabase.from("rep_profiles").insert({
        organization_id: membership.organizationId,
        user_id: id,
        rep_code: repCode,
        status: nextStatus === "suspended" ? "inactive" : "active",
      });
      if (createRepProfileError) {
        return NextResponse.json({ success: false, message: createRepProfileError.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["admin", "super_admin"])) return forbidden();

  const membership = await getOrgMembershipForUser(user.id);
  if (!membership || !hasAllowedOrgRole(membership.role, ["org_admin"])) return forbidden();

  const { id } = await context.params;
  if (id === user.id) {
    return NextResponse.json({ success: false, message: "You cannot delete your own account." }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data: targetMembership, error: targetError } = await supabase
    .from("organization_users")
    .select("id, user_id, role, status")
    .eq("organization_id", membership.organizationId)
    .eq("user_id", id)
    .maybeSingle();
  if (targetError || !targetMembership) {
    return NextResponse.json({ success: false, message: targetError?.message ?? "User not found." }, { status: 404 });
  }

  if (targetMembership.role === "org_admin" && targetMembership.status === "active") {
    const { count } = await supabase
      .from("organization_users")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", membership.organizationId)
      .eq("role", "org_admin")
      .eq("status", "active");
    if ((count ?? 0) <= 1) {
      return NextResponse.json({ success: false, message: "You cannot delete the last active organization admin." }, { status: 400 });
    }
  }

  const { error: assignmentsError } = await supabase
    .from("campaign_assignments")
    .delete()
    .eq("organization_id", membership.organizationId)
    .eq("user_id", id);
  if (assignmentsError) {
    return NextResponse.json({ success: false, message: assignmentsError.message }, { status: 500 });
  }

  const { error: repError } = await supabase
    .from("rep_profiles")
    .delete()
    .eq("organization_id", membership.organizationId)
    .eq("user_id", id);
  if (repError) {
    return NextResponse.json({ success: false, message: repError.message }, { status: 500 });
  }

  const { error: membershipDeleteError } = await supabase
    .from("organization_users")
    .delete()
    .eq("organization_id", membership.organizationId)
    .eq("user_id", id);
  if (membershipDeleteError) {
    return NextResponse.json({ success: false, message: membershipDeleteError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
