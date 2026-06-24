import { NextRequest, NextResponse } from "next/server";

import {
  getCampaignActivities,
  getCampaignAnalyticsSummary,
  getCampaignEvidence,
  getCampaignMapPoints,
} from "@/lib/campaign/intelligence";
import { getBrandByOrganizationId } from "@/lib/branding/server";
import { extractClientIp, hashIp, hashShareToken } from "@/lib/campaign/share";
import { resolveDateWindow } from "@/lib/server/query-window";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ token: string }> };

const requestTracker = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;

function isRateLimited(ip: string | null) {
  const key = ip ?? "unknown";
  const now = Date.now();
  const existing = requestTracker.get(key);
  if (!existing || now > existing.resetAt) {
    requestTracker.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  if (existing.count >= RATE_LIMIT_MAX_REQUESTS) {
    return true;
  }
  existing.count += 1;
  return false;
}

export async function GET(request: NextRequest, context: RouteContext) {
  console.time("shared-campaign-total");
  const { token } = await context.params;
  const dateFrom = request.nextUrl.searchParams.get("dateFrom");
  const dateTo = request.nextUrl.searchParams.get("dateTo");
  const area = request.nextUrl.searchParams.get("area");
  const section = request.nextUrl.searchParams.get("section") ?? "summary";
  const activityPage = Math.max(1, Number(request.nextUrl.searchParams.get("activityPage") ?? "1"));
  const activityPageSize = Math.min(100, Math.max(10, Number(request.nextUrl.searchParams.get("activityPageSize") ?? "20")));
  const evidenceOnly = request.nextUrl.searchParams.get("evidenceOnly") === "1";
  const evidencePage = Math.max(1, Number(request.nextUrl.searchParams.get("evidencePage") ?? "1"));
  const evidencePageSize = Math.min(20, Math.max(1, Number(request.nextUrl.searchParams.get("evidencePageSize") ?? "20")));
  const mapPage = Math.max(1, Number(request.nextUrl.searchParams.get("mapPage") ?? "1"));
  const mapPageSize = Math.min(2000, Math.max(20, Number(request.nextUrl.searchParams.get("mapPageSize") ?? "500")));
  const nonSummaryDateWindow = resolveDateWindow(dateFrom, dateTo, 2);
  const ip = extractClientIp(request);
  if (isRateLimited(ip)) {
    return NextResponse.json({ success: false, message: "Too many requests." }, { status: 429 });
  }

  const supabase = createServerSupabaseClient();
  const tokenHash = hashShareToken(token);
  console.time("find-share-link");
  const { data: shareLink } = await supabase
    .from("campaign_share_links")
    .select("id, organization_id, campaign_id, status, expires_at, revoked_at, view_count")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  console.timeEnd("find-share-link");

  if (!shareLink) {
    return NextResponse.json({ success: false, message: "Invalid or expired link." }, {
      status: 404,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  }

  const expired = new Date(shareLink.expires_at).getTime() < Date.now();
  const revoked = shareLink.status === "revoked" || Boolean(shareLink.revoked_at);
  if (expired || revoked || shareLink.status !== "active") {
    const status = expired ? "expired" : "revoked";
    return NextResponse.json({ success: false, message: `This shared link is ${status}.` }, {
      status: 403,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  }

  console.time("campaign");
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, name, description, status, state, lga, start_date, end_date")
    .eq("id", shareLink.campaign_id)
    .eq("organization_id", shareLink.organization_id)
    .maybeSingle();
  console.timeEnd("campaign");
  if (!campaign) {
    return NextResponse.json({ success: false, message: "Campaign not found." }, { status: 404 });
  }

  if (evidenceOnly || section === "evidence") {
    console.time("evidence");
    const evidenceResult = await getCampaignEvidence(
      supabase,
      shareLink.organization_id,
      shareLink.campaign_id,
      {
        dateFrom: nonSummaryDateWindow.dateFrom,
        dateTo: nonSummaryDateWindow.dateTo,
        area,
        page: evidencePage,
        pageSize: evidencePageSize,
      }
    );
    console.timeEnd("evidence");
    console.timeEnd("shared-campaign-total");
    return NextResponse.json(
      {
        success: true,
        evidence: evidenceResult.items,
        items: evidenceResult.items,
        pagination: evidenceResult.pagination,
        appliedDateWindow: nonSummaryDateWindow,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  if (section === "activities") {
    console.time("activities");
    const { rows: activities, total } = await getCampaignActivities(
      supabase,
      shareLink.organization_id,
      shareLink.campaign_id,
      {
        page: activityPage,
        pageSize: activityPageSize,
        dateFrom: nonSummaryDateWindow.dateFrom,
        dateTo: nonSummaryDateWindow.dateTo,
        area,
      }
    );
    console.timeEnd("activities");
    console.timeEnd("shared-campaign-total");
    return NextResponse.json(
      {
        success: true,
        activities,
        totalActivities: total,
        activityPage,
        activityPageSize,
        hasMore: activityPage * activityPageSize < total,
        appliedDateWindow: nonSummaryDateWindow,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  if (section === "map") {
    console.time("map");
    const mapPoints = await getCampaignMapPoints(
      supabase,
      shareLink.organization_id,
      shareLink.campaign_id,
      {
        source: "visits_only",
        dateFrom: nonSummaryDateWindow.dateFrom,
        dateTo: nonSummaryDateWindow.dateTo,
        area,
        page: mapPage,
        pageSize: mapPageSize,
      }
    );
    console.timeEnd("map");
    console.timeEnd("shared-campaign-total");
    return NextResponse.json(
      {
        success: true,
        mapPoints,
        pagination: { page: mapPage, pageSize: mapPageSize, hasMore: mapPoints.length === mapPageSize },
        appliedDateWindow: nonSummaryDateWindow,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  console.time("analytics");
  const [summary, orgBrand] = await Promise.all([
    getCampaignAnalyticsSummary(
      supabase,
      shareLink.organization_id,
      shareLink.campaign_id,
      { dateFrom, dateTo, area }
    ),
    getBrandByOrganizationId(shareLink.organization_id),
  ]);
  console.timeEnd("analytics");

  const now = new Date().toISOString();
  await Promise.all([
    supabase
      .from("campaign_share_links")
      .update({ last_viewed_at: now, view_count: (shareLink.view_count ?? 0) + 1 })
      .eq("id", shareLink.id),
    supabase
      .from("campaign_share_views")
      .insert({
        share_link_id: shareLink.id,
        ip_hash: hashIp(ip),
        user_agent: request.headers.get("user-agent"),
        referrer: request.headers.get("referer"),
      }),
  ]);

  console.timeEnd("shared-campaign-total");
  return NextResponse.json(
    {
      success: true,
      campaign,
      summary,
      brand: orgBrand
        ? {
            name: orgBrand.name,
            logoUrl: orgBrand.logoUrl,
            colorPreset: orgBrand.colorPreset ?? null,
            fontUrl: orgBrand.fontUrl ?? null,
            uiVariant: orgBrand.uiVariant ?? null,
          }
        : null,
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
