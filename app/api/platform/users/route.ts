import { NextRequest, NextResponse } from "next/server";

import { requireSuperAdmin, titleCase } from "@/lib/platform/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { PlatformUserRow } from "@/types/platform";

export async function GET(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (auth.error) return auth.error;

  const supabase = createServerSupabaseClient();
  const [membershipsRes, profilesRes] = await Promise.all([
    supabase
      .from("organization_users")
      .select("id, user_id, role, status, organization_id")
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("user_id, full_name"),
  ]);

  if (membershipsRes.error) {
    return NextResponse.json({ success: false, message: membershipsRes.error.message }, { status: 500 });
  }
  if (profilesRes.error) {
    return NextResponse.json({ success: false, message: profilesRes.error.message }, { status: 500 });
  }

  const orgIds = [...new Set((membershipsRes.data ?? []).map((m) => m.organization_id))];
  const { data: orgs } = orgIds.length
    ? await supabase.from("organizations").select("id, name").in("id", orgIds)
    : { data: [] as Array<{ id: string; name: string }> };

  const orgMap = new Map((orgs ?? []).map((o) => [o.id, o.name]));
  const profileMap = new Map((profilesRes.data ?? []).map((p) => [p.user_id, p.full_name ?? "Unknown User"]));

  const rows: PlatformUserRow[] = (membershipsRes.data ?? []).map((m) => ({
    id: m.user_id,
    name: profileMap.get(m.user_id) ?? "Unknown User",
    role: m.role,
    scope: orgMap.get(m.organization_id) ?? "Organization",
    status: titleCase(m.status),
  }));

  return NextResponse.json({ success: true, users: rows });
}

