import { NextRequest, NextResponse } from "next/server";

import { computeMetricsFromRows } from "@/lib/campaign/intelligence";
import { requireSuperAdmin, titleCase } from "@/lib/platform/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { PlatformCampaignDetail } from "@/types/platform";

function relativeTimeLabel(timestamp: string) {
  const diff = Math.max(0, Date.now() - new Date(timestamp).getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} mins ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs} hr${hrs > 1 ? "s" : ""} ago`;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin(request);
  if (auth.error) return auth.error;

  const { id } = await params;
  const supabase = createServerSupabaseClient();

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .select("id, organization_id, name, status, description, start_date, end_date, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  if (!campaign) return NextResponse.json({ success: false, message: "Campaign not found." }, { status: 404 });

  const [{ data: org }, { data: assignments }, { data: visits }, { data: sales }, { data: profiles }, { data: outlets }] = await Promise.all([
    supabase.from("organizations").select("name").eq("id", campaign.organization_id).maybeSingle(),
    supabase.from("campaign_assignments").select("user_id, role").eq("campaign_id", id),
    supabase
      .from("visits")
      .select("id, created_at, outcome, sync_status, outlet_id, agent_id, lga, state, task_payload")
      .eq("campaign_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("sales")
      .select("id, created_at, visit_id, quantity, sales_value")
      .eq("campaign_id", id),
    supabase.from("profiles").select("user_id, full_name"),
    supabase.from("outlets").select("id, name"),
  ]);

  const repCount = (assignments ?? []).filter((row) => row.role === "agent").length;
  const visitsList = visits ?? [];
  const salesList = sales ?? [];
  const canonical = computeMetricsFromRows(
    visitsList.map((visit) => ({
      id: visit.id,
      created_at: visit.created_at,
      sync_status: visit.sync_status ?? null,
      outlet_id: visit.outlet_id ?? null,
      state: visit.state ?? null,
      lga: visit.lga ?? null,
      task_payload: visit.task_payload ?? null,
    })),
    salesList.map((sale) => ({
      id: sale.id,
      visit_id: sale.visit_id ?? null,
      created_at: sale.created_at,
      quantity: sale.quantity ?? null,
      sales_value: sale.sales_value ?? null,
    })),
    `platform-campaign:${id}`
  );
  const sync = `${canonical.summary.syncHealth.toFixed(1)}%`;
  const conversions = canonical.convertedVisitIds.size;
  const salesValue = salesList.reduce((sum, row) => sum + Number(row.sales_value ?? 0), 0);
  const pendingUploads = visitsList.filter((v) => v.sync_status !== "synced").length;

  const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p.full_name ?? "Unknown"]));
  const outletMap = new Map((outlets ?? []).map((o) => [o.id, o.name ?? "Outlet"]));

  const detail: PlatformCampaignDetail = {
    id: campaign.id,
    organizationId: campaign.organization_id,
    organization: org?.name ?? "-",
    name: campaign.name,
    status: titleCase(campaign.status),
    sync,
    description: campaign.description ?? "No campaign description available.",
    startDate: campaign.start_date ? new Date(campaign.start_date).toLocaleDateString() : "-",
    endDate: campaign.end_date ? new Date(campaign.end_date).toLocaleDateString() : "-",
    totalSubmissions: canonical.summary.totalSubmissions,
    uniqueOutlets: canonical.summary.uniqueOutlets,
    areasCovered: canonical.summary.areasCovered,
    conversionRate: canonical.summary.conversionRate,
    reps: repCount,
    conversions,
    salesValue,
    posmChecks: canonical.summary.posmChecks,
    posmDeployed: canonical.summary.posmDeployed,
    posmUnits: canonical.summary.posmUnits,
    pendingUploads,
    recentActivity: visitsList.slice(0, 10).map((v) => ({
      rep: profileMap.get(v.agent_id) ?? "Unknown Rep",
      outlet: outletMap.get(v.outlet_id) ?? "Outlet",
      status: titleCase(v.outcome ?? "pending"),
      time: relativeTimeLabel(v.created_at),
    })),
  };

  return NextResponse.json({ success: true, campaign: detail });
}
