import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { getOrgMembershipForUser, hasAllowedOrgRole } from "@/lib/auth/org-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { extractAppRole } from "@/lib/auth/roles";

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["admin", "super_admin"])) return forbidden();

  const membership = await getOrgMembershipForUser(user.id);
  if (!membership || !hasAllowedOrgRole(membership.role, ["org_admin"])) return forbidden();

  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") ?? "1") || 1);
  const pageSizeParam = request.nextUrl.searchParams.get("pageSize");
  const fetchAll = pageSizeParam === "all";
  const pageSize = Math.min(50, Math.max(1, Number(pageSizeParam ?? "20") || 20));
  const search = (request.nextUrl.searchParams.get("search") ?? "").trim().toLowerCase();
  const roleFilter = (request.nextUrl.searchParams.get("role") ?? "all").trim();
  const statusFilter = (request.nextUrl.searchParams.get("status") ?? "all").trim();

  const supabase = createServerSupabaseClient();
  const { data: members, error: membersError } = await supabase
    .from("organization_users")
    .select("id, user_id, role, status, organization_id, invite_sent_at, accepted_at")
    .eq("organization_id", membership.organizationId)
    .order("created_at", { ascending: true });

  if (membersError) {
    return NextResponse.json({ success: false, message: membersError.message }, { status: 500 });
  }

  const userIds = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, full_name, email")
    .in("user_id", userIds);

  const authByUserId = new Map<string, { email: string | null; fullName: string | null; appRole: string | null }>();
  if (userIds.length > 0) {
    const { data: listData, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (!listError) {
      for (const authUser of listData.users) {
        if (!userIds.includes(authUser.id)) continue;
        const metadata = authUser.user_metadata ?? {};
        authByUserId.set(authUser.id, {
          email: authUser.email ?? null,
          fullName: (metadata.full_name as string | undefined) ?? (metadata.name as string | undefined) ?? null,
          appRole: extractAppRole({
            app_metadata: authUser.app_metadata,
            user_metadata: authUser.user_metadata,
          }),
        });
      }
    }
  }

  const byUserId = new Map((profiles ?? []).map((p) => [p.user_id, p]));
  const allUsers = (members ?? []).map((member) => {
    const profile = byUserId.get(member.user_id);
    const authUser = authByUserId.get(member.user_id);
    const resolvedEmail = profile?.email ?? authUser?.email ?? null;
    const resolvedName =
      profile?.full_name ??
      authUser?.fullName ??
      (resolvedEmail ? resolvedEmail.split("@")[0] : "Unnamed User");

    return {
      id: member.user_id,
      membershipId: member.id,
      displayName: resolvedName,
      name: resolvedName,
      email: resolvedEmail,
      organizationRole: member.role,
      appRole: authUser?.appRole ?? null,
      role: member.role,
      status: member.status,
      inviteSentAt: member.invite_sent_at ?? null,
      acceptedAt: member.accepted_at ?? null,
    };
  });

  const roles = [...new Set(allUsers.map((item) => item.organizationRole).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  const filteredUsers = allUsers.filter((item) => {
    if (roleFilter !== "all" && item.organizationRole !== roleFilter) return false;
    if (statusFilter !== "all" && item.status !== statusFilter) return false;
    if (search) {
      const haystack = [item.displayName, item.email, item.organizationRole, item.appRole]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  const total = filteredUsers.length;
  const from = (page - 1) * pageSize;
  const users = fetchAll ? filteredUsers : filteredUsers.slice(from, from + pageSize);

  return NextResponse.json({ success: true, users, total, page, pageSize, roles });
}
