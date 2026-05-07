import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function resolveBaseUrl(request: NextRequest) {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (envUrl) return envUrl;
  const origin = request.headers.get("origin");
  if (origin) return origin;
  return "http://localhost:3000";
}

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["super_admin"])) return forbidden();

  const { id } = await params;
  const supabase = createServerSupabaseClient();
  const baseUrl = resolveBaseUrl(request);

  const { data: membership, error: membershipError } = await supabase
    .from("organization_users")
    .select("user_id")
    .eq("organization_id", id)
    .eq("role", "org_admin")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    return NextResponse.json({ success: false, message: membershipError.message }, { status: 500 });
  }
  if (!membership?.user_id) {
    return NextResponse.json(
      { success: false, message: "No organization admin found to invite." },
      { status: 404 }
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, full_name, phone")
    .eq("user_id", membership.user_id)
    .maybeSingle();

  const email = profile?.email?.trim();
  if (!email) {
    return NextResponse.json(
      { success: false, message: "Admin email is missing on profile." },
      { status: 400 }
    );
  }

  const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: {
      full_name: profile?.full_name ?? "Organization Admin",
      phone: profile?.phone ?? null,
      role: "admin",
    },
    redirectTo: `${baseUrl}/accept-invite`,
  });

  if (!inviteError) {
    await supabase
      .from("organization_users")
      .update({ status: "invited", invite_sent_at: new Date().toISOString(), accepted_at: null })
      .eq("organization_id", id)
      .eq("user_id", membership.user_id);
    return NextResponse.json({
      success: true,
      message: "Invite email resent successfully.",
    });
  }

  const { data: generatedLink, error: generateError } = await supabase.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      redirectTo: `${baseUrl}/accept-invite`,
    },
  });

  if (generateError) {
    return NextResponse.json(
      { success: false, message: inviteError.message || generateError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    message:
      "Invite link generated, but automatic email may not be configured. Share the link manually.",
    inviteLink: generatedLink?.properties?.action_link ?? null,
  });
}
