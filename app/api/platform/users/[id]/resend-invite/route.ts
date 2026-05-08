import { NextRequest, NextResponse } from "next/server";

import { requireSuperAdmin, writePlatformAuditLog } from "@/lib/platform/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function resolveBaseUrl(request: NextRequest) {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl) return envUrl;
  const origin = request.headers.get("origin");
  if (origin) return origin;
  return "http://localhost:3000";
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin(request);
  if (auth.error) return auth.error;

  const { id } = await params;
  const supabase = createServerSupabaseClient();

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("email, full_name, phone")
    .eq("user_id", id)
    .maybeSingle();
  if (profileError) return NextResponse.json({ success: false, message: profileError.message }, { status: 500 });
  if (!profile?.email) return NextResponse.json({ success: false, message: "User email not found." }, { status: 400 });

  const baseUrl = resolveBaseUrl(request);
  const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(profile.email, {
    data: {
      full_name: profile.full_name ?? "User",
      phone: profile.phone ?? null,
    },
    redirectTo: `${baseUrl}/accept-invite`,
  });
  if (inviteError) return NextResponse.json({ success: false, message: inviteError.message }, { status: 500 });

  await supabase
    .from("organization_users")
    .update({ status: "invited", invite_sent_at: new Date().toISOString(), accepted_at: null })
    .eq("user_id", id);

  await writePlatformAuditLog({
    actorUserId: auth.user.id,
    targetType: "user",
    targetId: id,
    action: "platform_user.invite_resent",
    afterState: { email: profile.email },
  });

  return NextResponse.json({ success: true, message: "Invite resent successfully." });
}

