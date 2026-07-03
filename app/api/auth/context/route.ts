import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserFromRequest, isAuthProviderUnavailableError } from "@/lib/auth/server-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  let user;
  try {
    user = await getAuthenticatedUserFromRequest(request);
  } catch (error) {
    if (isAuthProviderUnavailableError(error)) {
      return NextResponse.json(
        { success: false, offline: true, message: "Authentication provider is unavailable. Use cached offline access if available." },
        { status: 503 }
      );
    }
    throw error;
  }

  if (!user) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase
      .from("profiles")
      .select("user_id, full_name, email, phone, must_change_password")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("organization_users")
      .select("organization_id, role, status, organizations(name, slug, status, logo_url, updated_at, brand_favicon_ico_url, brand_favicon_16_url, brand_favicon_32_url, brand_apple_touch_icon_url, brand_android_192_url, brand_android_512_url, brand_manifest_url, experience_config)")
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
