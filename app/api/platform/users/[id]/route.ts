import { NextRequest, NextResponse } from "next/server";

import { requireSuperAdmin, titleCase, writePlatformAuditLog } from "@/lib/platform/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { PlatformUserDetail } from "@/types/platform";

type PatchPayload = {
  appRole?: "agent" | "admin" | "super_admin";
  orgRole?: "org_admin" | "supervisor" | "agent";
  orgStatus?: "active" | "inactive" | "invited" | "suspended";
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin(request);
  if (auth.error) return auth.error;

  const { id } = await params;
  const supabase = createServerSupabaseClient();
  const [profileRes, membershipRes] = await Promise.all([
    supabase.from("profiles").select("user_id, full_name, email, phone").eq("user_id", id).maybeSingle(),
    supabase.from("organization_users").select("id, organization_id, role, status").eq("user_id", id).limit(1).maybeSingle(),
  ]);

  if (profileRes.error) return NextResponse.json({ success: false, message: profileRes.error.message }, { status: 500 });
  if (membershipRes.error) return NextResponse.json({ success: false, message: membershipRes.error.message }, { status: 500 });
  if (!profileRes.data || !membershipRes.data) {
    return NextResponse.json({ success: false, message: "User not found." }, { status: 404 });
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", membershipRes.data.organization_id)
    .maybeSingle();

  const detail: PlatformUserDetail = {
    id,
    name: profileRes.data.full_name ?? "Unknown User",
    role: membershipRes.data.role,
    scope: org?.name ?? "Organization",
    status: titleCase(membershipRes.data.status),
    email: profileRes.data.email ?? "-",
    phone: profileRes.data.phone ?? "-",
  };

  return NextResponse.json({ success: true, user: detail });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin(request);
  if (auth.error) return auth.error;

  const { id } = await params;
  const payload = (await request.json()) as PatchPayload;
  const supabase = createServerSupabaseClient();

  const { data: membership, error: membershipError } = await supabase
    .from("organization_users")
    .select("id, role, status, organization_id")
    .eq("user_id", id)
    .limit(1)
    .maybeSingle();
  if (membershipError) return NextResponse.json({ success: false, message: membershipError.message }, { status: 500 });
  if (!membership) return NextResponse.json({ success: false, message: "User membership not found." }, { status: 404 });

  const before = { membership, payload };

  if (payload.orgRole || payload.orgStatus) {
    if (membership.role === "org_admin" && payload.orgRole && payload.orgRole !== "org_admin") {
      const { count } = await supabase
        .from("organization_users")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", membership.organization_id)
        .eq("role", "org_admin")
        .eq("status", "active");
      if ((count ?? 0) <= 1) {
        return NextResponse.json(
          { success: false, message: "Cannot remove the last active organization admin." },
          { status: 400 }
        );
      }
    }

    const patch: Record<string, string> = {};
    if (payload.orgRole) patch.role = payload.orgRole;
    if (payload.orgStatus) patch.status = payload.orgStatus;
    const { error: updateMembershipError } = await supabase
      .from("organization_users")
      .update(patch)
      .eq("id", membership.id);
    if (updateMembershipError) {
      return NextResponse.json({ success: false, message: updateMembershipError.message }, { status: 500 });
    }
  }

  if (payload.appRole) {
    const { data: userInfo, error: getUserError } = await supabase.auth.admin.getUserById(id);
    if (getUserError || !userInfo.user) {
      return NextResponse.json({ success: false, message: getUserError?.message ?? "Unable to load user." }, { status: 500 });
    }
    const currentAppRole = String(userInfo.user.app_metadata?.role ?? userInfo.user.user_metadata?.role ?? "");
    if (currentAppRole === "super_admin" && payload.appRole !== "super_admin") {
      const { data: usersList, error: usersListError } = await supabase.auth.admin.listUsers();
      if (usersListError) {
        return NextResponse.json({ success: false, message: usersListError.message }, { status: 500 });
      }
      const superAdminCount = (usersList.users ?? []).filter((u) => {
        const role = String(u.app_metadata?.role ?? u.user_metadata?.role ?? "");
        return role === "super_admin";
      }).length;
      if (superAdminCount <= 1) {
        return NextResponse.json(
          { success: false, message: "Cannot remove the last super admin role." },
          { status: 400 }
        );
      }
    }

    const nextMetadata = {
      ...(userInfo.user.app_metadata ?? {}),
      role: payload.appRole,
    };
    const { error: appRoleError } = await supabase.auth.admin.updateUserById(id, { app_metadata: nextMetadata });
    if (appRoleError) {
      return NextResponse.json({ success: false, message: appRoleError.message }, { status: 500 });
    }
  }

  await writePlatformAuditLog({
    actorUserId: auth.user.id,
    targetType: "user",
    targetId: id,
    action: "platform_user.updated",
    beforeState: before,
    afterState: payload,
  });

  return NextResponse.json({ success: true });
}
