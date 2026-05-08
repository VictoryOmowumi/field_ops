import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function requireSuperAdmin(request: NextRequest) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return { error: NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 }) };
  if (!hasRequiredRole(user, ["super_admin"])) {
    return { error: NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 }) };
  }
  return { user };
}

export function titleCase(value: string | null | undefined) {
  if (!value) return "-";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export async function writePlatformAuditLog(input: {
  actorUserId: string;
  targetType: string;
  targetId: string;
  action: string;
  beforeState?: unknown;
  afterState?: unknown;
}) {
  const supabase = createServerSupabaseClient();
  await supabase.from("platform_audit_logs").insert({
    actor_user_id: input.actorUserId,
    target_type: input.targetType,
    target_id: input.targetId,
    action: input.action,
    before_state: input.beforeState ?? null,
    after_state: input.afterState ?? null,
  });
}

