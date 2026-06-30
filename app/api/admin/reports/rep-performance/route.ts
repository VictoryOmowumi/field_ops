import { NextRequest, NextResponse } from "next/server";

import { getOrgMembershipForUser, hasAllowedOrgRole } from "@/lib/auth/org-access";
import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { resolveDateWindow } from "@/lib/server/query-window";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { captureException } from "@/lib/observability/sentry";

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
}

type RepRow = { agent_id: string; visits: number; conversions: number; sales_value: number };

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["admin", "super_admin"])) return forbidden();
  const membership = await getOrgMembershipForUser(user.id);
  if (!membership || !hasAllowedOrgRole(membership.role, ["org_admin", "supervisor"])) return forbidden();

  const supabase = createServerSupabaseClient();
  const organizationId = membership.organizationId;
  const campaignIdParam = request.nextUrl.searchParams.get("campaignId");
  const campaignId = campaignIdParam && campaignIdParam !== "all" ? campaignIdParam : null;
  const dateWindow = resolveDateWindow(
    request.nextUrl.searchParams.get("dateFrom"),
    request.nextUrl.searchParams.get("dateTo"),
    2
  );
  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") ?? "1"));
  const pageSize = Math.min(100, Math.max(10, Number(request.nextUrl.searchParams.get("pageSize") ?? "20")));

  try {
    const [repRes, profilesRes, repProfilesRes] = await Promise.all([
      supabase.rpc("reports_rep_performance", {
        p_organization_id: organizationId,
        p_campaign_id: campaignId,
        p_date_from: dateWindow.dateFrom ? `${dateWindow.dateFrom}T00:00:00.000Z` : null,
        p_date_to: dateWindow.dateTo ? `${dateWindow.dateTo}T23:59:59.999Z` : null,
      }),
      supabase.from("profiles").select("user_id, full_name"),
      supabase.from("rep_profiles").select("user_id, state, lga").eq("organization_id", organizationId),
    ]);
    if (repRes.error) throw new Error(`Failed to load rep performance: ${repRes.error.message}`);

    const profileMap = new Map((profilesRes.data ?? []).map((p) => [p.user_id, p.full_name ?? "Unnamed Rep"]));
    const territoryMap = new Map(
      (repProfilesRes.data ?? []).map((p) => [p.user_id, [p.lga, p.state].filter(Boolean).join(", ")])
    );

    const performanceAll = ((repRes.data ?? []) as RepRow[])
      .map((row) => ({
        rep: profileMap.get(row.agent_id) ?? "Unknown Rep",
        territory: territoryMap.get(row.agent_id) ?? "-",
        visits: Number(row.visits),
        conversions: Number(row.conversions),
        salesValue: Number(row.sales_value),
        rate: row.visits ? (Number(row.conversions) / Number(row.visits)) * 100 : 0,
      }))
      .sort((a, b) => b.visits - a.visits);

    const total = performanceAll.length;
    const start = (page - 1) * pageSize;
    const performance = performanceAll.slice(start, start + pageSize);

    return NextResponse.json({
      success: true,
      performance,
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
      appliedDateWindow: dateWindow,
    });
  } catch (error) {
    captureException(error, { organizationId, route: "/api/admin/reports/rep-performance" });
    return NextResponse.json({ success: false, message: "Failed to load rep performance." }, { status: 500 });
  }
}
