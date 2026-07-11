import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { invalidateBrandCache } from "@/lib/branding/server";

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

  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, slug, experience_config")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ success: false, message: "Organization not found." }, { status: 404 });

  return NextResponse.json({ success: true, experienceConfig: data.experience_config ?? {} });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["super_admin"])) return forbidden();

  const { id } = await params;
  const supabase = createServerSupabaseClient();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ success: false, message: "Body must be a JSON object." }, { status: 400 });
  }

  const { error } = await supabase
    .from("organizations")
    .update({ experience_config: body })
    .eq("id", id);

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

  invalidateBrandCache();

  return NextResponse.json({ success: true });
}
