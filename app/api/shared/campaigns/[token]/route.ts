import { NextRequest, NextResponse } from "next/server";

import {
  getCampaignActivities,
  getCampaignAnalyticsSummary,
  getCampaignEvidence,
  getCampaignMapPoints,
} from "@/lib/campaign/intelligence";
import { extractClientIp, hashIp, hashShareToken } from "@/lib/campaign/share";
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
  const { token } = await context.params;
  const ip = extractClientIp(request);
  if (isRateLimited(ip)) {
    return NextResponse.json({ success: false, message: "Too many requests." }, { status: 429 });
  }

  const supabase = createServerSupabaseClient();
  const tokenHash = hashShareToken(token);
  const { data: shareLink } = await supabase
    .from("campaign_share_links")
    .select("id, organization_id, campaign_id, status, expires_at, revoked_at, view_count")
    .eq("token_hash", tokenHash)
    .maybeSingle();

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

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, name, description, status, state, lga, start_date, end_date")
    .eq("id", shareLink.campaign_id)
    .eq("organization_id", shareLink.organization_id)
    .maybeSingle();
  if (!campaign) {
    return NextResponse.json({ success: false, message: "Campaign not found." }, { status: 404 });
  }

  const [{ rows: activities, total }, summary, mapPoints, evidence] = await Promise.all([
    getCampaignActivities(supabase, shareLink.organization_id, shareLink.campaign_id, { page: 1, pageSize: 2000 }),
    getCampaignAnalyticsSummary(supabase, shareLink.organization_id, shareLink.campaign_id),
    getCampaignMapPoints(supabase, shareLink.organization_id, shareLink.campaign_id),
    getCampaignEvidence(supabase, shareLink.organization_id, shareLink.campaign_id),
  ]);

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

  return NextResponse.json(
    {
      success: true,
      campaign,
      summary,
      mapPoints,
      activities,
      totalActivities: total,
      evidence,
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
