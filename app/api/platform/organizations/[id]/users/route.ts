import { NextRequest, NextResponse } from "next/server";

import { requireSuperAdmin, titleCase } from "@/lib/platform/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin(request);
  if (auth.error) return auth.error;

  const { id } = await params;
  const supabase = createServerSupabaseClient();
  const { data: memberships, error } = await supabase
    .from("organization_users")
    .select("user_id, role, status")
    .eq("organization_id", id)
    .order("created_at", { ascending: false });
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

  return NextResponse.json({ success: true, users });
}

