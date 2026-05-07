import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { getOrgMembershipForUser, hasAllowedOrgRole } from "@/lib/auth/org-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["admin", "super_admin"])) return forbidden();

  const membership = await getOrgMembershipForUser(user.id);
  if (!membership || !hasAllowedOrgRole(membership.role, ["org_admin"])) return forbidden();

  const { id: targetUserId } = await context.params;
  const supabase = createServerSupabaseClient();

  const { data: member, error: memberError } = await supabase
    .from("organization_users")
    .select("user_id, status")
    .eq("organization_id", membership.organizationId)
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (memberError || !member) {
    return NextResponse.json({ success: false, message: memberError?.message ?? "User not found." }, { status: 404 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("email")
    .eq("user_id", targetUserId)
    .maybeSingle();

  const email = profile?.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ success: false, message: "User does not have an email address." }, { status: 400 });
  }

  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/accept-invite`;
  const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, { redirectTo });

  if (inviteError) {
    return NextResponse.json({ success: false, message: inviteError.message }, { status: 500 });
  }

  await supabase
    .from("organization_users")
    .update({ status: "invited", invite_sent_at: new Date().toISOString(), accepted_at: null })
    .eq("organization_id", membership.organizationId)
    .eq("user_id", targetUserId);

  return NextResponse.json({ success: true, message: "Invite resent." });
}
