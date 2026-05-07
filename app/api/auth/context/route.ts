import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserFromRequest } from "@/lib/auth/server-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase
      .from("profiles")
      .select("user_id, full_name, email, phone")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("organization_users")
      .select("organization_id, role, status, organizations(name, slug)")
      .eq("user_id", user.id),
  ]);

  return NextResponse.json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      appRole: user.role,
      profile: profile ?? null,
      memberships: memberships ?? [],
    },
  });
}
