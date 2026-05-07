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

function csvEscape(value: string | number) {
  const raw = String(value ?? "");
  if (raw.includes(",") || raw.includes("\"") || raw.includes("\n")) {
    return `"${raw.replace(/"/g, "\"\"")}"`;
  }
  return raw;
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["admin", "super_admin"])) return forbidden();
  const membership = await getOrgMembershipForUser(user.id);
  if (!membership || !hasAllowedOrgRole(membership.role, ["org_admin", "supervisor"])) return forbidden();

  const type = request.nextUrl.searchParams.get("type");
  const campaignId = request.nextUrl.searchParams.get("campaignId");
  const dateFrom = request.nextUrl.searchParams.get("dateFrom");
  const dateTo = request.nextUrl.searchParams.get("dateTo");
  if (type !== "rep-performance" && type !== "campaign-activities") {
    return NextResponse.json({ success: false, message: "Unsupported export type." }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  let salesQuery = supabase
    .from("sales")
    .select("id, created_at, campaign_id, outlet_id, agent_id, product_name, quantity, sales_value, conversion_status")
    .eq("organization_id", membership.organizationId);
  if (campaignId && campaignId !== "all") salesQuery = salesQuery.eq("campaign_id", campaignId);
  if (dateFrom) salesQuery = salesQuery.gte("created_at", `${dateFrom}T00:00:00.000Z`);
  if (dateTo) salesQuery = salesQuery.lte("created_at", `${dateTo}T23:59:59.999Z`);

  const { data: sales, error } = await salesQuery;

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

  const [{ data: profiles }, { data: campaigns }, { data: outlets }] = await Promise.all([
    supabase.from("profiles").select("user_id, full_name"),
    supabase.from("campaigns").select("id, name").eq("organization_id", membership.organizationId),
    supabase.from("outlets").select("id, name").eq("organization_id", membership.organizationId),
  ]);
  const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p.full_name ?? "Unknown Rep"]));
  const campaignMap = new Map((campaigns ?? []).map((c) => [c.id, c.name ?? "Unknown Campaign"]));
  const outletMap = new Map((outlets ?? []).map((o) => [o.id, o.name ?? "Unknown Outlet"]));

  if (type === "campaign-activities") {
    let visitsQuery = supabase
      .from("visits")
      .select("id, created_at, campaign_id, outlet_id, agent_id, task_type, outcome, visit_outcome_label, task_payload")
      .eq("organization_id", membership.organizationId);
    if (campaignId && campaignId !== "all") visitsQuery = visitsQuery.eq("campaign_id", campaignId);
    if (dateFrom) visitsQuery = visitsQuery.gte("created_at", `${dateFrom}T00:00:00.000Z`);
    if (dateTo) visitsQuery = visitsQuery.lte("created_at", `${dateTo}T23:59:59.999Z`);
    const { data: visits, error: visitsError } = await visitsQuery;
    if (visitsError) return NextResponse.json({ success: false, message: visitsError.message }, { status: 500 });

    const lines = ["ActivityType,ActivityId,Campaign,Outlet,Agent,Timestamp,Status,TaskType,Activity,Product,Availability,Quantity,BuyingPrice,SellingPrice,SalesValue"];
    for (const visit of visits ?? []) {
      const base = [
        csvEscape("visit"),
        csvEscape(visit.id),
        csvEscape(campaignMap.get(visit.campaign_id ?? "") ?? "-"),
        csvEscape(outletMap.get(visit.outlet_id ?? "") ?? "-"),
        csvEscape(profileMap.get(visit.agent_id ?? "") ?? "-"),
        csvEscape(visit.created_at),
        csvEscape(visit.visit_outcome_label ?? visit.outcome ?? "-"),
        csvEscape(visit.task_type ?? "-"),
      ];
      const payload = (visit.task_payload ?? {}) as {
        activities?: Array<{
          activityId?: string;
          payload?: {
            products?: Array<Record<string, unknown>>;
            sales?: Array<Record<string, unknown>>;
          };
        }>;
      };
      const activities = Array.isArray(payload.activities) ? payload.activities : [];

      if (activities.length === 0) {
        lines.push([
          ...base,
          csvEscape(""),
          csvEscape(""),
          csvEscape(""),
          csvEscape(""),
          csvEscape(""),
          csvEscape(""),
          csvEscape(""),
        ].join(","));
        continue;
      }

      for (const activity of activities) {
        const activityName = activity.activityId ?? "-";
        const products = Array.isArray(activity.payload?.products) ? activity.payload?.products : [];
        const salesRows = Array.isArray(activity.payload?.sales) ? activity.payload?.sales : [];
        const expandedRows = products.length > 0 ? products : salesRows;

        if (expandedRows.length === 0) {
          lines.push([
            ...base,
            csvEscape(activityName),
            csvEscape(""),
            csvEscape(""),
            csvEscape(""),
            csvEscape(""),
            csvEscape(""),
            csvEscape(""),
          ].join(","));
          continue;
        }

        for (const row of expandedRows) {
          const availability =
            row.available === true ? "Yes" : row.available === false ? "No" : "";
          const quantity = row.quantity ?? "";
          const buyingPrice = row.buyingPrice ?? "";
          const sellingPrice = row.sellingPrice ?? "";
          const salesValue = row.price ?? "";
          lines.push([
            ...base.slice(0, 7),
            csvEscape(activityName),
            csvEscape(activityName),
            csvEscape(String(row.productName ?? "-")),
            csvEscape(String(availability)),
            csvEscape(String(quantity)),
            csvEscape(String(buyingPrice)),
            csvEscape(String(sellingPrice)),
            csvEscape(String(salesValue)),
          ].join(","));
        }
      }
    }
    for (const sale of sales ?? []) {
      lines.push([
        csvEscape("sale"),
        csvEscape(sale.id),
        csvEscape(campaignMap.get(sale.campaign_id ?? "") ?? "-"),
        csvEscape(outletMap.get(sale.outlet_id ?? "") ?? "-"),
        csvEscape(profileMap.get(sale.agent_id ?? "") ?? "-"),
        csvEscape(sale.created_at),
        csvEscape(sale.conversion_status ?? "-"),
        csvEscape("sell_to_outlet"),
        csvEscape("sell_to_outlet"),
        csvEscape(sale.product_name ?? "-"),
        csvEscape(""),
        csvEscape(Number(sale.quantity ?? 0)),
        csvEscape(""),
        csvEscape(""),
        csvEscape(Number(sale.sales_value ?? 0).toFixed(2)),
      ].join(","));
    }

    const csv = lines.join("\n");
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="campaign-activities.csv"',
      },
    });
  }

  const rows = new Map<string, { visits: number; conversions: number; salesValue: number }>();
  for (const item of sales ?? []) {
    if (!item.agent_id) continue;
    const current = rows.get(item.agent_id) ?? { visits: 0, conversions: 0, salesValue: 0 };
    current.visits += 1;
    if (item.conversion_status === "converted") current.conversions += 1;
    current.salesValue += Number(item.sales_value ?? 0);
    rows.set(item.agent_id, current);
  }

  const lines = ["Rep,Visits,Conversions,ConversionRatePercent,SalesValue"];
  for (const [agentId, metrics] of rows.entries()) {
    const repName = profileMap.get(agentId) ?? "Unknown Rep";
    const rate = metrics.visits ? (metrics.conversions / metrics.visits) * 100 : 0;
    lines.push([
      csvEscape(repName),
      csvEscape(metrics.visits),
      csvEscape(metrics.conversions),
      csvEscape(rate.toFixed(2)),
      csvEscape(metrics.salesValue.toFixed(2)),
    ].join(","));
  }

  const csv = lines.join("\n");
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="rep-performance.csv"',
    },
  });
}
