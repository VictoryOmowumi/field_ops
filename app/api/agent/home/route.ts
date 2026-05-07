import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { getPrimaryOrgMembership } from "@/lib/auth/org-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
}

export async function GET(_request: NextRequest) {
  const user = await getAuthenticatedUserFromRequest(_request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["agent", "admin", "super_admin"])) return forbidden();

  const membership = await getPrimaryOrgMembership(user.id);
  if (!membership) return forbidden();

  const supabase = createServerSupabaseClient();
  const [{ data: profile }, { count: totalCampaigns }, { count: totalUsers }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("campaigns")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", membership.organizationId),
    supabase
      .from("organization_users")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", membership.organizationId),
  ]);

  return NextResponse.json({
    success: true,
    home: {
      fullName: profile?.full_name ?? "Agent",
      role: membership.role,
      metrics: {
        campaigns: totalCampaigns ?? 0,
        teammates: totalUsers ?? 0,
        pendingSync: 0,
      },
      recentActivity: [] as Array<{ id: string; title: string; subtitle: string; time: string; status: "pending" | "converted" | "synced" }>,
    },
  });
}
