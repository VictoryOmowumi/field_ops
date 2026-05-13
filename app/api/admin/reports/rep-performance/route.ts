import { NextRequest, NextResponse } from "next/server";

import { getOrgMembershipForUser, hasAllowedOrgRole } from "@/lib/auth/org-access";
import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["admin", "super_admin"])) return forbidden();
  const membership = await getOrgMembershipForUser(user.id);
  if (!membership || !hasAllowedOrgRole(membership.role, ["org_admin", "supervisor"])) return forbidden();

  const supabase = createServerSupabaseClient();
  const organizationId = membership.organizationId;
  const campaignId = request.nextUrl.searchParams.get("campaignId");
  const dateFrom = request.nextUrl.searchParams.get("dateFrom");
  const dateTo = request.nextUrl.searchParams.get("dateTo");

  let visitsQuery = supabase
    .from("visits")
    .select("id, agent_id")
    .eq("organization_id", organizationId);
  if (campaignId && campaignId !== "all") visitsQuery = visitsQuery.eq("campaign_id", campaignId);
  if (dateFrom) visitsQuery = visitsQuery.gte("created_at", `${dateFrom}T00:00:00.000Z`);
  if (dateTo) visitsQuery = visitsQuery.lte("created_at", `${dateTo}T23:59:59.999Z`);

  let salesQuery = supabase
    .from("sales")
    .select("agent_id, sales_value, quantity, visit_id")
    .eq("organization_id", organizationId);
  if (campaignId && campaignId !== "all") salesQuery = salesQuery.eq("campaign_id", campaignId);
  if (dateFrom) salesQuery = salesQuery.gte("created_at", `${dateFrom}T00:00:00.000Z`);
  if (dateTo) salesQuery = salesQuery.lte("created_at", `${dateTo}T23:59:59.999Z`);

  const [{ data: visits, error: visitsError }, { data: sales, error: salesError }, { data: profiles }, { data: repProfiles }] = await Promise.all([
    visitsQuery,
    salesQuery,
    supabase.from("profiles").select("user_id, full_name"),
    supabase.from("rep_profiles").select("user_id, state, lga").eq("organization_id", organizationId),
  ]);

  if (visitsError) return NextResponse.json({ success: false, message: visitsError.message }, { status: 500 });
  if (salesError) return NextResponse.json({ success: false, message: salesError.message }, { status: 500 });

  const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p.full_name ?? "Unnamed Rep"]));
  const territoryMap = new Map((repProfiles ?? []).map((p) => [p.user_id, [p.lga, p.state].filter(Boolean).join(", ")]));
  const rows = new Map<string, { rep: string; territory: string; visits: number; conversions: number; salesValue: number }>();

  const convertedVisitIds = new Set(
    (sales ?? [])
      .filter((sale) => Number(sale.quantity ?? 0) > 0 || Number(sale.sales_value ?? 0) > 0)
      .map((sale) => sale.visit_id)
      .filter(Boolean)
  );

  for (const visit of visits ?? []) {
    if (!visit.agent_id) continue;
    const existing = rows.get(visit.agent_id) ?? {
      rep: profileMap.get(visit.agent_id) ?? "Unknown Rep",
      territory: territoryMap.get(visit.agent_id) ?? "-",
      visits: 0,
      conversions: 0,
      salesValue: 0,
    };
    existing.visits += 1;
    if (convertedVisitIds.has(visit.id)) existing.conversions += 1;
    rows.set(visit.agent_id, existing);
  }

  for (const sale of sales ?? []) {
    if (!sale.agent_id) continue;
    const existing = rows.get(sale.agent_id) ?? {
      rep: profileMap.get(sale.agent_id) ?? "Unknown Rep",
      territory: territoryMap.get(sale.agent_id) ?? "-",
      visits: 0,
      conversions: 0,
      salesValue: 0,
    };
    existing.salesValue += Number(sale.sales_value ?? 0);
    rows.set(sale.agent_id, existing);
  }

  const performance = Array.from(rows.values())
    .map((item) => ({
      ...item,
      rate: item.visits ? (item.conversions / item.visits) * 100 : 0,
    }))
    .sort((a, b) => b.visits - a.visits);

  return NextResponse.json({ success: true, performance });
}
