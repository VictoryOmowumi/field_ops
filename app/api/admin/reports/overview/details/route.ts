import { NextRequest, NextResponse } from "next/server";

import { getOrgMembershipForUser, hasAllowedOrgRole } from "@/lib/auth/org-access";
import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { resolveDateWindow } from "@/lib/server/query-window";
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
  const dateWindow = resolveDateWindow(
    request.nextUrl.searchParams.get("dateFrom"),
    request.nextUrl.searchParams.get("dateTo"),
    2
  );
  const productPage = Math.max(1, Number(request.nextUrl.searchParams.get("productPage") ?? "1"));
  const productPageSize = Math.min(50, Math.max(5, Number(request.nextUrl.searchParams.get("productPageSize") ?? "10")));

  let visitsQuery = supabase.from("visits").select("id, created_at").eq("organization_id", membership.organizationId);
  let salesQuery = supabase
    .from("sales")
    .select("created_at, product_name, quantity, sales_value, visit_id")
    .eq("organization_id", membership.organizationId);
  if (campaignId && campaignId !== "all") {
    visitsQuery = visitsQuery.eq("campaign_id", campaignId);
    salesQuery = salesQuery.eq("campaign_id", campaignId);
  }
  if (dateWindow.dateFrom) {
    visitsQuery = visitsQuery.gte("created_at", `${dateWindow.dateFrom}T00:00:00.000Z`);
    salesQuery = salesQuery.gte("created_at", `${dateWindow.dateFrom}T00:00:00.000Z`);
  }
  if (dateWindow.dateTo) {
    visitsQuery = visitsQuery.lte("created_at", `${dateWindow.dateTo}T23:59:59.999Z`);
    salesQuery = salesQuery.lte("created_at", `${dateWindow.dateTo}T23:59:59.999Z`);
  }

  const [{ data: visits }, { data: sales }] = await Promise.all([visitsQuery, salesQuery]);
  const convertedVisitIds = new Set(
    (sales ?? [])
      .filter((item) => Number(item.quantity ?? 0) > 0 || Number(item.sales_value ?? 0) > 0)
      .map((item) => item.visit_id)
      .filter(Boolean)
  );

  const byDay = new Map<string, { day: string; visits: number; conversions: number }>();
  for (const item of visits ?? []) {
    const day = new Date(item.created_at).toISOString().slice(0, 10);
    const bucket = byDay.get(day) ?? { day, visits: 0, conversions: 0 };
    bucket.visits += 1;
    if (convertedVisitIds.has(item.id)) bucket.conversions += 1;
    byDay.set(day, bucket);
  }
  const trend = [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)).slice(-14);

  const byProduct = new Map<string, number>();
  for (const item of sales ?? []) {
    const product = item.product_name || "Unknown";
    byProduct.set(product, (byProduct.get(product) ?? 0) + Number(item.quantity ?? 0));
  }
  const productsAll = [...byProduct.entries()]
    .map(([product, value]) => ({ product, value }))
    .sort((a, b) => b.value - a.value);
  const total = productsAll.length;
  const start = (productPage - 1) * productPageSize;
  const products = productsAll.slice(start, start + productPageSize);

  return NextResponse.json({
    success: true,
    trend,
    products,
    productPagination: {
      page: productPage,
      pageSize: productPageSize,
      total,
      hasMore: productPage * productPageSize < total,
    },
    appliedDateWindow: dateWindow,
  });
}
