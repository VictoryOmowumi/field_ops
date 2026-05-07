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
  const campaignId = request.nextUrl.searchParams.get("campaignId");
  const dateFrom = request.nextUrl.searchParams.get("dateFrom");
  const dateTo = request.nextUrl.searchParams.get("dateTo");

  let visitsQuery = supabase
    .from("visits")
    .select("id, created_at, outcome")
    .eq("organization_id", membership.organizationId);
  if (campaignId && campaignId !== "all") visitsQuery = visitsQuery.eq("campaign_id", campaignId);
  if (dateFrom) visitsQuery = visitsQuery.gte("created_at", `${dateFrom}T00:00:00.000Z`);
  if (dateTo) visitsQuery = visitsQuery.lte("created_at", `${dateTo}T23:59:59.999Z`);

  let salesQuery = supabase
    .from("sales")
    .select("id, created_at, product_name, quantity, sales_value, conversion_status")
    .eq("organization_id", membership.organizationId);
  if (campaignId && campaignId !== "all") salesQuery = salesQuery.eq("campaign_id", campaignId);
  if (dateFrom) salesQuery = salesQuery.gte("created_at", `${dateFrom}T00:00:00.000Z`);
  if (dateTo) salesQuery = salesQuery.lte("created_at", `${dateTo}T23:59:59.999Z`);

  const [{ data: visits, error: visitsError }, { data: sales, error: salesError }] = await Promise.all([
    visitsQuery,
    salesQuery,
  ]);
  if (visitsError) return NextResponse.json({ success: false, message: visitsError.message }, { status: 500 });
  if (salesError) return NextResponse.json({ success: false, message: salesError.message }, { status: 500 });

  const byDay = new Map<string, { visits: number; conversions: number }>();
  const byProduct = new Map<string, number>();
  let converted = 0;
  let totalValue = 0;

  for (const item of visits ?? []) {
    const day = new Date(item.created_at).toLocaleDateString("en-US", { weekday: "short" });
    const bucket = byDay.get(day) ?? { visits: 0, conversions: 0 };
    bucket.visits += 1;
    if (item.outcome === "converted") {
      bucket.conversions += 1;
      converted += 1;
    }
    byDay.set(day, bucket);
  }

  for (const item of sales ?? []) {
    const product = item.product_name || "Unknown";
    byProduct.set(product, (byProduct.get(product) ?? 0) + Number(item.quantity ?? 0));
    totalValue += Number(item.sales_value ?? 0);
  }

  const trend = Array.from(byDay.entries()).map(([day, value]) => ({ day, ...value }));
  const products = Array.from(byProduct.entries())
    .map(([product, value]) => ({ product, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  return NextResponse.json({
    success: true,
    overview: {
      totalVisits: (visits ?? []).length,
      conversions: converted,
      conversionRate: (visits ?? []).length ? (converted / (visits ?? []).length) * 100 : 0,
      salesValue: totalValue,
      trend,
      products,
    },
  });
}
