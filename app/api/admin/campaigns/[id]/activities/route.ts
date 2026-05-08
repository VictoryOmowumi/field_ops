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
      .limit(100),
    supabase
      .from("sales")
      .select("id, visit_id, product_name, quantity, conversion_status, created_at, outlet_id, agent_id")
      .eq("organization_id", membership.organizationId)
      .eq("campaign_id", id)
      .order("created_at", { ascending: false })
      .limit(200),
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

  const salesByVisitId = new Map<
    string,
    Array<{ id: string; product_name: string | null; quantity: number | null; conversion_status: string | null }>
  >();
  for (const sale of salesRes.data ?? []) {
    if (!sale.visit_id) continue;
    const list = salesByVisitId.get(sale.visit_id) ?? [];
    list.push({
      id: sale.id,
      product_name: sale.product_name ?? null,
      quantity: sale.quantity ?? null,
      conversion_status: sale.conversion_status ?? null,
    });
    salesByVisitId.set(sale.visit_id, list);
  }

  const visitActivities = (visitsRes.data ?? []).map((item) => {
    const saleLines = salesByVisitId.get(item.id) ?? [];
    return {
      id: `visit-${item.id}`,
      type: "visit",
      status: item.outcome,
      createdAt: item.created_at,
      outlet: item.outlet_id ? outletMap.get(item.outlet_id) ?? "-" : "-",
      actor: item.agent_id ? profileMap.get(item.agent_id) ?? "-" : "-",
      saleCount: saleLines.length,
      saleLines,
    };
  });

  const orphanSales = (salesRes.data ?? [])
    .filter((sale) => !sale.visit_id)
    .map((item) => ({
      id: `sale-${item.id}`,
      type: "sale" as const,
      status: item.conversion_status,
      createdAt: item.created_at,
      outlet: item.outlet_id ? outletMap.get(item.outlet_id) ?? "-" : "-",
      actor: item.agent_id ? profileMap.get(item.agent_id) ?? "-" : "-",
      saleCount: 1,
      saleLines: [
        {
          id: item.id,
          product_name: item.product_name ?? null,
          quantity: item.quantity ?? null,
          conversion_status: item.conversion_status ?? null,
        },
      ],
    }));

  const activities = [...visitActivities, ...orphanSales]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 100);

  return NextResponse.json({ success: true, activities });
}
