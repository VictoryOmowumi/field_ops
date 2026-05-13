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

function csvEscape(value: string | number | null | undefined) {
  const raw = String(value ?? "");
  if (raw.includes(",") || raw.includes("\"") || raw.includes("\n")) {
    return `"${raw.replace(/"/g, "\"\"")}"`;
  }
  return raw;
}

function normalizeTaskPayload(taskPayload: unknown) {
  return (taskPayload ?? {}) as {
    activities?: Array<{
      activityId?: string;
      payload?: {
        products?: Array<Record<string, unknown>>;
        sales?: Array<Record<string, unknown>>;
        deployed?: boolean;
        quantity?: number;
      };
    }>;
  };
}

type OutletContext = {
  id: string;
  name: string;
  phone: string;
  address: string;
  area: string;
  status: "Converted" | "Onboarded";
  posmInstalled: "Yes" | "No";
  posmUnits: number;
  salesValue: number;
  productsSold: string;
};

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["admin", "super_admin"])) return forbidden();
  const membership = await getOrgMembershipForUser(user.id);
  if (!membership || !hasAllowedOrgRole(membership.role, ["org_admin", "supervisor"])) return forbidden();

  const type = request.nextUrl.searchParams.get("type");
  const exportMode = request.nextUrl.searchParams.get("mode") === "raw" ? "raw" : "summary";
  const campaignId = request.nextUrl.searchParams.get("campaignId");
  const dateFrom = request.nextUrl.searchParams.get("dateFrom");
  const dateTo = request.nextUrl.searchParams.get("dateTo");
  if (type !== "rep-performance" && type !== "campaign-activities") {
    return NextResponse.json({ success: false, message: "Unsupported export type." }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  let salesQuery = supabase
    .from("sales")
    .select("id, visit_id, created_at, campaign_id, outlet_id, agent_id, product_name, quantity, sales_value, conversion_status")
    .eq("organization_id", membership.organizationId);
  if (campaignId && campaignId !== "all") salesQuery = salesQuery.eq("campaign_id", campaignId);
  if (dateFrom) salesQuery = salesQuery.gte("created_at", `${dateFrom}T00:00:00.000Z`);
  if (dateTo) salesQuery = salesQuery.lte("created_at", `${dateTo}T23:59:59.999Z`);

  let visitsQuery = supabase
    .from("visits")
    .select("id, created_at, campaign_id, outlet_id, agent_id, task_type, outcome, visit_outcome_label, task_payload, state, lga")
    .eq("organization_id", membership.organizationId);
  if (campaignId && campaignId !== "all") visitsQuery = visitsQuery.eq("campaign_id", campaignId);
  if (dateFrom) visitsQuery = visitsQuery.gte("created_at", `${dateFrom}T00:00:00.000Z`);
  if (dateTo) visitsQuery = visitsQuery.lte("created_at", `${dateTo}T23:59:59.999Z`);

  const [{ data: visits, error: visitsError }, { data: sales, error: salesError }] = await Promise.all([
    visitsQuery,
    salesQuery,
  ]);
  if (visitsError) return NextResponse.json({ success: false, message: visitsError.message }, { status: 500 });
  if (salesError) return NextResponse.json({ success: false, message: salesError.message }, { status: 500 });

  const [{ data: profiles }, { data: campaigns }, { data: outlets }] = await Promise.all([
    supabase.from("profiles").select("user_id, full_name"),
    supabase.from("campaigns").select("id, name").eq("organization_id", membership.organizationId),
    supabase.from("outlets").select("id, name, phone, address, state, lga").eq("organization_id", membership.organizationId),
  ]);
  const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p.full_name ?? "Unknown Rep"]));
  const campaignMap = new Map((campaigns ?? []).map((c) => [c.id, c.name ?? "Unknown Campaign"]));
  const outletDbMap = new Map((outlets ?? []).map((o) => [o.id, o]));

  const salesByVisit = new Map<string, Array<(typeof sales)[number]>>();
  const convertedOutletIds = new Set<string>();
  const salesByOutlet = new Map<string, Array<(typeof sales)[number]>>();
  for (const sale of sales ?? []) {
    if (sale.visit_id) {
      const rows = salesByVisit.get(sale.visit_id) ?? [];
      rows.push(sale);
      salesByVisit.set(sale.visit_id, rows);
    }
    if (sale.outlet_id) {
      const outletRows = salesByOutlet.get(sale.outlet_id) ?? [];
      outletRows.push(sale);
      salesByOutlet.set(sale.outlet_id, outletRows);
      if (Number(sale.quantity ?? 0) > 0 || Number(sale.sales_value ?? 0) > 0) {
        convertedOutletIds.add(sale.outlet_id);
      }
    }
  }

  const outletContextMap = new Map<string, OutletContext>();
  for (const visit of visits ?? []) {
    if (!visit.outlet_id) continue;
    const outlet = outletDbMap.get(visit.outlet_id);
    const area = [visit.lga ?? outlet?.lga, visit.state ?? outlet?.state].filter(Boolean).join(", ") || "N/A";
    const existing = outletContextMap.get(visit.outlet_id) ?? {
      id: visit.outlet_id,
      name: outlet?.name ?? "Unknown Outlet",
      phone: outlet?.phone ?? "N/A",
      address: outlet?.address ?? "N/A",
      area,
      status: "Onboarded",
      posmInstalled: "No",
      posmUnits: 0,
      salesValue: 0,
      productsSold: "",
    };

    const payload = normalizeTaskPayload(visit.task_payload);
    for (const item of payload.activities ?? []) {
      if (item.activityId !== "posm_deployment") continue;
      if (item.payload?.deployed) {
        existing.posmInstalled = "Yes";
        const qty = Number(item.payload?.quantity ?? 0);
        if (Number.isFinite(qty) && qty > 0) existing.posmUnits += qty;
      }
    }
    outletContextMap.set(visit.outlet_id, existing);
  }

  for (const [outletId, outletSalesRows] of salesByOutlet.entries()) {
    const existing = outletContextMap.get(outletId) ?? {
      id: outletId,
      name: outletDbMap.get(outletId)?.name ?? "Unknown Outlet",
      phone: outletDbMap.get(outletId)?.phone ?? "N/A",
      address: outletDbMap.get(outletId)?.address ?? "N/A",
      area: [outletDbMap.get(outletId)?.lga, outletDbMap.get(outletId)?.state].filter(Boolean).join(", ") || "N/A",
      status: "Onboarded",
      posmInstalled: "No",
      posmUnits: 0,
      salesValue: 0,
      productsSold: "",
    };
    existing.status = convertedOutletIds.has(outletId) ? "Converted" : "Onboarded";
    existing.salesValue = outletSalesRows.reduce((sum, row) => sum + Number(row.sales_value ?? 0), 0);
    existing.productsSold = [...new Set(outletSalesRows.map((row) => row.product_name).filter(Boolean))].join(" | ");
    outletContextMap.set(outletId, existing);
  }

  if (type === "campaign-activities") {
    if (exportMode === "summary") {
      const lines = [
        "ActivityId,Campaign,Outlet Name,Outlet Address,Outlet Phone Number,Outlet Status,POSM Installed,POSM Units,Agent,Area,Visit Timestamp,Activities Completed,Products Checked,Availability Summary,Price Survey Summary,Product Survey Summary,Quantity Sold,Total Sales Value,Buying Price Summary,Selling Price Summary",
      ];

      for (const visit of visits ?? []) {
        const context = visit.outlet_id ? outletContextMap.get(visit.outlet_id) : null;
        const payload = normalizeTaskPayload(visit.task_payload);
        const activitiesCompleted = new Set<string>();
        const productsChecked = new Set<string>();
        const availabilitySummary = new Set<string>();
        const priceSummary = new Set<string>();
        const productSurveySummary = new Set<string>();
        const buyingPriceSummary = new Set<string>();
        const sellingPriceSummary = new Set<string>();
        let posmInstalled: "Yes" | "No" = "No";
        let posmUnits = 0;

        for (const activity of payload.activities ?? []) {
          const activityId = activity.activityId ?? "-";
          activitiesCompleted.add(activityId);
          const products = Array.isArray(activity.payload?.products) ? activity.payload?.products : [];
          for (const row of products) {
            const productName = String(row.productName ?? row.product ?? "").trim();
            if (productName) productsChecked.add(productName);

            if (activityId === "availability_survey" && productName) {
              const available = row.available === true ? "Yes" : row.available === false ? "No" : "-";
              availabilitySummary.add(`${productName}: ${available}`);
            }
            if (activityId === "price_survey" && productName) {
              const bp = row.buyingPrice ?? "-";
              const sp = row.sellingPrice ?? "-";
              priceSummary.add(`${productName}: BP ${bp}, SP ${sp}`);
              if (row.buyingPrice !== undefined && row.buyingPrice !== null && row.buyingPrice !== "") {
                buyingPriceSummary.add(`${productName}: ${row.buyingPrice}`);
              }
              if (row.sellingPrice !== undefined && row.sellingPrice !== null && row.sellingPrice !== "") {
                sellingPriceSummary.add(`${productName}: ${row.sellingPrice}`);
              }
            }
            if (activityId === "product_survey" && productName) {
              const available = row.available === true ? "Yes" : row.available === false ? "No" : "-";
              const qty = row.quantity ?? 0;
              productSurveySummary.add(`${productName}: Available ${available}, Qty ${qty}`);
            }
            if (activityId === "sell_to_outlet" && productName) {
              if (row.buyingPrice !== undefined && row.buyingPrice !== null && row.buyingPrice !== "") {
                buyingPriceSummary.add(`${productName}: ${row.buyingPrice}`);
              }
              if (row.sellingPrice !== undefined && row.sellingPrice !== null && row.sellingPrice !== "") {
                sellingPriceSummary.add(`${productName}: ${row.sellingPrice}`);
              }
            }
          }

          if (activityId === "posm_deployment") {
            const deployed = Boolean(activity.payload?.deployed);
            if (deployed) {
              posmInstalled = "Yes";
              const qty = Number(activity.payload?.quantity ?? 0);
              if (Number.isFinite(qty) && qty > 0) posmUnits += qty;
            }
          }
        }

        const visitSales = salesByVisit.get(visit.id) ?? [];
        const quantitySold = visitSales.reduce((sum, row) => {
          if (!(Number(row.quantity ?? 0) > 0 || Number(row.sales_value ?? 0) > 0)) return sum;
          return sum + Number(row.quantity ?? 0);
        }, 0);
        const totalSalesValue = visitSales.reduce((sum, row) => {
          if (!(Number(row.quantity ?? 0) > 0 || Number(row.sales_value ?? 0) > 0)) return sum;
          return sum + Number(row.sales_value ?? 0);
        }, 0);
        const outletStatus: "Converted" | "Onboarded" =
          quantitySold > 0 || totalSalesValue > 0 ? "Converted" : "Onboarded";

        lines.push([
          csvEscape(visit.id),
          csvEscape(campaignMap.get(visit.campaign_id ?? "") ?? "-"),
          csvEscape(context?.name ?? "Unknown Outlet"),
          csvEscape(context?.address ?? "N/A"),
          csvEscape(context?.phone ?? "N/A"),
          csvEscape(outletStatus),
          csvEscape(posmInstalled),
          csvEscape(posmUnits),
          csvEscape(profileMap.get(visit.agent_id ?? "") ?? "-"),
          csvEscape(context?.area ?? "N/A"),
          csvEscape(visit.created_at),
          csvEscape([...activitiesCompleted].join(", ") || "-"),
          csvEscape([...productsChecked].join(", ") || "-"),
          csvEscape([...availabilitySummary].join("; ") || "-"),
          csvEscape([...priceSummary].join("; ") || "-"),
          csvEscape([...productSurveySummary].join("; ") || "-"),
          csvEscape(quantitySold),
          csvEscape(totalSalesValue.toFixed(2)),
          csvEscape([...buyingPriceSummary].join("; ") || "-"),
          csvEscape([...sellingPriceSummary].join("; ") || "-"),
        ].join(","));
      }

      const csv = lines.join("\n");
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="campaign-business-summary.csv"',
        },
      });
    }

    const lines = [
      "ActivityType,ActivityId,Campaign,Outlet,Outlet Address,Outlet Phone Number,Outlet Status,POSM Installed,POSM Units,Agent,Area,Timestamp,Status,TaskType,Activity,Product,Availability,Quantity,BuyingPrice,SellingPrice,SalesValue",
    ];

    for (const visit of visits ?? []) {
      const context = visit.outlet_id ? outletContextMap.get(visit.outlet_id) : null;
      const base = [
        csvEscape("visit"),
        csvEscape(visit.id),
        csvEscape(campaignMap.get(visit.campaign_id ?? "") ?? "-"),
        csvEscape(context?.name ?? (visit.outlet_id ? outletDbMap.get(visit.outlet_id)?.name ?? "-" : "-")),
        csvEscape(context?.address ?? "N/A"),
        csvEscape(context?.phone ?? "N/A"),
        csvEscape(context?.status ?? "Onboarded"),
        csvEscape(context?.posmInstalled ?? "No"),
        csvEscape(context?.posmUnits ?? 0),
        csvEscape(profileMap.get(visit.agent_id ?? "") ?? "-"),
        csvEscape(context?.area ?? ([visit.lga, visit.state].filter(Boolean).join(", ") || "N/A")),
        csvEscape(visit.created_at),
        csvEscape(visit.visit_outcome_label ?? visit.outcome ?? "-"),
        csvEscape(visit.task_type ?? "-"),
      ];

      const payload = normalizeTaskPayload(visit.task_payload);
      const activities = Array.isArray(payload.activities) ? payload.activities : [];

      if (activities.length === 0) {
        lines.push([...base, csvEscape(""), csvEscape(""), csvEscape(""), csvEscape(""), csvEscape(""), csvEscape(""), csvEscape("")].join(","));
        continue;
      }

      for (const activity of activities) {
        const activityName = activity.activityId ?? "-";
        const products = Array.isArray(activity.payload?.products) ? activity.payload?.products : [];
        const expandedRows = products.length > 0 ? products : [activity.payload ?? {}];

        for (const row of expandedRows) {
          const typedRow = row as Record<string, unknown>;
          const availability = typedRow.available === true ? "Yes" : typedRow.available === false ? "No" : "";
          const quantity = typedRow.quantity ?? "";
          const buyingPrice = typedRow.buyingPrice ?? "";
          const sellingPrice = typedRow.sellingPrice ?? "";
          const salesValue = typedRow.price ?? "";
          lines.push([
            ...base,
            csvEscape(activityName),
            csvEscape(String(typedRow.productName ?? "-")),
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
      const context = sale.outlet_id ? outletContextMap.get(sale.outlet_id) : null;
      lines.push([
        csvEscape("sale"),
        csvEscape(sale.id),
        csvEscape(campaignMap.get(sale.campaign_id ?? "") ?? "-"),
        csvEscape(context?.name ?? (sale.outlet_id ? outletDbMap.get(sale.outlet_id)?.name ?? "-" : "-")),
        csvEscape(context?.address ?? "N/A"),
        csvEscape(context?.phone ?? "N/A"),
        csvEscape(context?.status ?? "Onboarded"),
        csvEscape(context?.posmInstalled ?? "No"),
        csvEscape(context?.posmUnits ?? 0),
        csvEscape(profileMap.get(sale.agent_id ?? "") ?? "-"),
        csvEscape(context?.area ?? "N/A"),
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
  const convertedVisitIds = new Set(
    (sales ?? [])
      .filter((sale) => Number(sale.quantity ?? 0) > 0 || Number(sale.sales_value ?? 0) > 0)
      .map((sale) => sale.visit_id)
      .filter(Boolean)
  );
  for (const visit of visits ?? []) {
    if (!visit.agent_id) continue;
    const current = rows.get(visit.agent_id) ?? { visits: 0, conversions: 0, salesValue: 0 };
    current.visits += 1;
    if (convertedVisitIds.has(visit.id)) current.conversions += 1;
    rows.set(visit.agent_id, current);
  }
  for (const sale of sales ?? []) {
    if (!sale.agent_id) continue;
    const current = rows.get(sale.agent_id) ?? { visits: 0, conversions: 0, salesValue: 0 };
    current.salesValue += Number(sale.sales_value ?? 0);
    rows.set(sale.agent_id, current);
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
