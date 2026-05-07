import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["super_admin"])) return forbidden();

  const { id } = await params;
  const supabase = createServerSupabaseClient();

  const { data: organization, error: orgError } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (orgError) {
    return NextResponse.json({ success: false, message: orgError.message }, { status: 500 });
  }
  if (!organization) {
    return NextResponse.json({ success: false, message: "Organization not found." }, { status: 404 });
  }

  const [{ count: userCount }, { count: campaignCount }] = await Promise.all([
    supabase
      .from("organization_users")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", id),
    supabase
      .from("campaigns")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", id),
  ]);

  return NextResponse.json({
    success: true,
    organization: {
      ...organization,
      userCount: userCount ?? 0,
      campaignCount: campaignCount ?? 0,
    },
  });
}
