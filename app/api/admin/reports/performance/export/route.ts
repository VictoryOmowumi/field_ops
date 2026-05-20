import { NextRequest, NextResponse } from "next/server";

import { getOrgMembershipForUser, hasAllowedOrgRole } from "@/lib/auth/org-access";
import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { aggregateCampaignPerformance } from "@/lib/reporting/aggregateCampaignPerformance";
import type { PerformanceRow } from "@/lib/reporting/types";
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

function toCsvRow(row: PerformanceRow) {
  return [
    csvEscape(row.date ?? "-"),
    csvEscape(row.area),
    csvEscape(row.agentName),
    csvEscape(row.plannedVisits.toFixed(2)),
    csvEscape(row.achievedVisits),
    csvEscape(row.visitAchievementRate.toFixed(2)),
    csvEscape(row.plannedConversions.toFixed(2)),
    csvEscape(row.achievedConversions),
    csvEscape(row.conversionRate.toFixed(2)),
    csvEscape(row.plannedSalesValue.toFixed(2)),
    csvEscape(row.achievedSalesValue.toFixed(2)),
    csvEscape(row.salesAchievementRate.toFixed(2)),
    csvEscape(row.plannedSamples.toFixed(2)),
    csvEscape(row.achievedSamples.toFixed(2)),
    csvEscape(row.samplingAchievementRate.toFixed(2)),
    csvEscape(row.posmDeployedOutlets),
  ].join(",");
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["admin", "super_admin"])) return forbidden();
  const membership = await getOrgMembershipForUser(user.id);
  if (!membership || !hasAllowedOrgRole(membership.role, ["org_admin", "supervisor"])) return forbidden();

  const campaignId = request.nextUrl.searchParams.get("campaignId") ?? undefined;
  const dateFrom = request.nextUrl.searchParams.get("dateFrom") ?? undefined;
  const dateTo = request.nextUrl.searchParams.get("dateTo") ?? undefined;

  try {
    const result = await aggregateCampaignPerformance(createServerSupabaseClient(), membership.organizationId, {
      campaignId,
      dateFrom,
      dateTo,
      groupBy: "date",
    });
    const lines = [
      "Date,Area,Agent,Planned Visits,Achieved Visits,Visit Achievement %,Planned Conversions,Achieved Conversions,Conversion Achievement %,Planned Sales Value,Achieved Sales Value,Sales Achievement %,Planned Samples,Achieved Samples,Sampling Achievement %,POSM Deployed Outlets",
      ...result.rows.map(toCsvRow),
      toCsvRow(result.totals),
    ];
    return new NextResponse(lines.join("\n"), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="campaign-performance.csv"',
      },
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: (error as Error).message }, { status: 500 });
  }
}
