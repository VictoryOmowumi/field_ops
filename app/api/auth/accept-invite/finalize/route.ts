import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserFromRequest } from "@/lib/auth/server-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();

  const supabase = createServerSupabaseClient();
  const nowIso = new Date().toISOString();

  const { error } = await supabase
    .from("organization_users")
    .update({
      status: "active",
      accepted_at: nowIso,
    })
    .eq("user_id", user.id)
    .in("status", ["invited", "inactive"]);

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

