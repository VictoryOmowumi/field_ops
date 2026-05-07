import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["super_admin"])) return forbidden();

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "true";
  const supabase = createServerSupabaseClient();

  const { data: members, error } = await supabase
    .from("organization_users")
    .select("id, user_id, status")
    .in("status", ["invited", "inactive"]);

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];
  const updateIds: string[] = [];
  const nowIso = new Date().toISOString();

  for (const member of members ?? []) {
    scanned += 1;
    const { data: authUserData, error: authUserError } = await supabase.auth.admin.getUserById(member.user_id);
    if (authUserError || !authUserData.user) {
      skipped += 1;
      errors.push(`Failed lookup for user ${member.user_id}: ${authUserError?.message ?? "not found"}`);
      continue;
    }

    if (!authUserData.user.last_sign_in_at) {
      skipped += 1;
      continue;
    }

    updateIds.push(member.id);
  }

  if (!dryRun && updateIds.length > 0) {
    const { error: updateError } = await supabase
      .from("organization_users")
      .update({
        status: "active",
        accepted_at: nowIso,
      })
      .in("id", updateIds);

    if (updateError) {
      return NextResponse.json({ success: false, message: updateError.message }, { status: 500 });
    }
    updated = updateIds.length;
  }

  if (dryRun) updated = updateIds.length;

  return NextResponse.json({
    success: true,
    dryRun,
    summary: {
      scanned,
      updated,
      skipped,
      errors,
    },
  });
}

