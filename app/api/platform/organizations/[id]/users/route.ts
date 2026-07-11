import { NextRequest, NextResponse } from "next/server";

import { requireSuperAdmin, titleCase } from "@/lib/platform/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin(request);
  if (auth.error) return auth.error;

  const { id } = await params;
  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page")) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(request.nextUrl.searchParams.get("pageSize")) || 10));

  const supabase = createServerSupabaseClient();
  const { data: memberships, error, count } = await supabase
    .from("organization_users")
    .select("user_id, role, status", { count: "exact" })
    .eq("organization_id", id)
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, (page - 1) * pageSize + pageSize - 1);
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

  const userIds = (memberships ?? []).map((m) => m.user_id);
  const { data: profiles } = userIds.length
    ? await supabase.from("profiles").select("user_id, full_name").in("user_id", userIds)
    : { data: [] as Array<{ user_id: string; full_name: string | null }> };
  const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p.full_name ?? "Unknown User"]));

  const users = (memberships ?? []).map((m) => ({
    id: m.user_id,
    name: profileMap.get(m.user_id) ?? "Unknown User",
    role: m.role,
    status: titleCase(m.status),
  }));

  return NextResponse.json({ success: true, users, pagination: { page, pageSize, total: count ?? users.length } });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin(request);
  if (auth.error) return auth.error;

  const { id } = await params;
  const { userId, role } = (await request.json()) as { userId?: string; role?: string };
  if (!userId || !role) {
    return NextResponse.json({ success: false, message: "userId and role are required." }, { status: 400 });
  }
  const validRoles = ["org_admin", "supervisor", "agent"];
  if (!validRoles.includes(role)) {
    return NextResponse.json({ success: false, message: "Invalid role." }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("organization_users")
    .update({ role })
    .eq("organization_id", id)
    .eq("user_id", userId);

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

