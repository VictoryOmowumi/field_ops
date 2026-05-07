import { NextRequest, NextResponse } from "next/server";

import { getOrgMembershipForUser, hasAllowedOrgRole } from "@/lib/auth/org-access";
import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
}

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["admin", "super_admin"])) return forbidden();

  const membership = await getOrgMembershipForUser(user.id);
  if (!membership || !hasAllowedOrgRole(membership.role, ["org_admin", "supervisor"])) return forbidden();

  const { id } = await context.params;
  const supabase = createServerSupabaseClient();

  const [visitsRes, salesRes] = await Promise.all([
    supabase
      .from("visits")
      .select("id, outcome, created_at, outlet_id, agent_id")
      .eq("organization_id", membership.organizationId)
      .eq("campaign_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("sales")
      .select("id, conversion_status, created_at, outlet_id, agent_id")
      .eq("organization_id", membership.organizationId)
      .eq("campaign_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const outletIds = [
    ...new Set([...(visitsRes.data ?? []).map((x) => x.outlet_id), ...(salesRes.data ?? []).map((x) => x.outlet_id)].filter(Boolean)),
  ] as string[];
  const userIds = [
    ...new Set([...(visitsRes.data ?? []).map((x) => x.agent_id), ...(salesRes.data ?? []).map((x) => x.agent_id)].filter(Boolean)),
  ] as string[];

  const [{ data: outlets }, { data: profiles }] = await Promise.all([
    outletIds.length ? supabase.from("outlets").select("id, name").in("id", outletIds) : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    userIds.length ? supabase.from("profiles").select("user_id, full_name").in("user_id", userIds) : Promise.resolve({ data: [] as Array<{ user_id: string; full_name: string | null }> }),
  ]);

  const outletMap = new Map((outlets ?? []).map((x) => [x.id, x.name]));
  const profileMap = new Map((profiles ?? []).map((x) => [x.user_id, x.full_name ?? "Unknown"]));

  const activities = [
    ...(visitsRes.data ?? []).map((item) => ({
      id: `visit-${item.id}`,
      type: "visit",
      status: item.outcome,
      createdAt: item.created_at,
      outlet: item.outlet_id ? outletMap.get(item.outlet_id) ?? "-" : "-",
      actor: item.agent_id ? profileMap.get(item.agent_id) ?? "-" : "-",
    })),
    ...(salesRes.data ?? []).map((item) => ({
      id: `sale-${item.id}`,
      type: "sale",
      status: item.conversion_status,
      createdAt: item.created_at,
      outlet: item.outlet_id ? outletMap.get(item.outlet_id) ?? "-" : "-",
      actor: item.agent_id ? profileMap.get(item.agent_id) ?? "-" : "-",
    })),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 100);

  return NextResponse.json({ success: true, activities });
}

