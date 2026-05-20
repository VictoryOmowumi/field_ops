import { NextRequest, NextResponse } from "next/server";

import { aggregateCampaignPerformance } from "@/lib/reporting/aggregateCampaignPerformance";
import type { PerformanceRow } from "@/lib/reporting/types";
import { requireSuperAdmin } from "@/lib/platform/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin(request);
  if (auth.error) return auth.error;

  const { id } = await params;
  const dateFrom = request.nextUrl.searchParams.get("dateFrom") ?? undefined;
  const dateTo = request.nextUrl.searchParams.get("dateTo") ?? undefined;
  const supabase = createServerSupabaseClient();

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, organization_id")
    .eq("id", id)
    .maybeSingle();
  if (campaignError) return NextResponse.json({ success: false, message: campaignError.message }, { status: 500 });
  if (!campaign) return NextResponse.json({ success: false, message: "Campaign not found." }, { status: 404 });

  try {
    const result = await aggregateCampaignPerformance(supabase, campaign.organization_id, {
      campaignId: id,
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
        "Content-Disposition": 'attachment; filename="platform-campaign-performance.csv"',
      },
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: (error as Error).message }, { status: 500 });
  }
}
