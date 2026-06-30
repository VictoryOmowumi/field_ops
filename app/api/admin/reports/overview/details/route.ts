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

function toDayLabel(isoDate: string) {
  return new Date(`${isoDate}T00:00:00.000Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    timeZone: "UTC",
  });
}

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
  const productPage = Math.max(1, Number(request.nextUrl.searchParams.get("productPage") ?? "1"));
  const productPageSize = Math.min(50, Math.max(5, Number(request.nextUrl.searchParams.get("productPageSize") ?? "10")));

  const rpcParams = {
    p_organization_id: organizationId,
    p_campaign_id: campaignId,
    p_date_from: dateWindow.dateFrom ? `${dateWindow.dateFrom}T00:00:00.000Z` : null,
    p_date_to: dateWindow.dateTo ? `${dateWindow.dateTo}T23:59:59.999Z` : null,
  };

  try {
    const [trendRes, productsRes] = await Promise.all([
      supabase.rpc("dashboard_trend", rpcParams),
      supabase.rpc("reports_product_performance", rpcParams),
    ]);
    if (trendRes.error) throw new Error(`Failed to load trend: ${trendRes.error.message}`);
    if (productsRes.error) throw new Error(`Failed to load product performance: ${productsRes.error.message}`);

    const trend = ((trendRes.data ?? []) as Array<{ day: string; visits: number; conversions: number }>)
      .map((row) => ({ day: toDayLabel(row.day), visits: Number(row.visits), conversions: Number(row.conversions) }))
      .slice(-14);

    const productsAll = ((productsRes.data ?? []) as Array<{ product_name: string; total_quantity: number }>).map(
      (row) => ({ product: row.product_name, value: Number(row.total_quantity) })
    );
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
  } catch (error) {
    captureException(error, { organizationId, route: "/api/admin/reports/overview/details" });
    return NextResponse.json({ success: false, message: "Failed to load report details." }, { status: 500 });
  }
}
