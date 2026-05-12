import { NextRequest, NextResponse } from "next/server";

import { getOrgMembershipForUser, hasAllowedOrgRole } from "@/lib/auth/org-access";
import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { generateShareToken, hashShareToken, resolvePublicBaseUrl } from "@/lib/campaign/share";
import { getBrandByOrganizationId } from "@/lib/branding/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };

type CreateShareLinkPayload = {
  expiresAt?: string;
  recipientEmail?: string | null;
  sendEmail?: boolean;
};

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function sendShareEmail(input: {
  to: string;
  campaignName: string;
  shareUrl: string;
  expiresAt: string;
  brandName: string;
  brandLogoUrl?: string | null;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  const from = fromEmail?.includes("<") ? fromEmail : `${input.brandName} <${fromEmail}>`;
  const replyTo = process.env.RESEND_REPLY_TO_EMAIL || fromEmail;
  if (!apiKey || !from) {
    throw new Error("Resend is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL.");
  }
  const expiresAtLabel = new Date(input.expiresAt).toLocaleString();
  const text = [
    `${input.brandName} Campaign Share`,
    "",
    `You were invited to view campaign progress for: ${input.campaignName}`,
    `Open link: ${input.shareUrl}`,
    `Expires: ${expiresAtLabel}`,
    "",
    "If you were not expecting this email, you can ignore it.",
    "Support: support@activationiq.org",
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5">
      <h2 style="margin:0 0 12px">${input.brandName} Campaign Share</h2>
      ${input.brandLogoUrl ? `<p style="margin:0 0 14px"><img src="${input.brandLogoUrl}" alt="${input.brandName}" style="max-height:36px;width:auto" /></p>` : ""}
      <p style="margin:0 0 10px">Hello,</p>
      <p style="margin:0 0 10px">
        You were invited to view campaign progress for
        <strong>${input.campaignName}</strong>.
      </p>
      <p style="margin:14px 0">
        <a href="${input.shareUrl}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:600">
          Open Shared Campaign
        </a>
      </p>
      <p style="margin:0 0 10px;font-size:13px;color:#4b5563">
        Link expiry: ${expiresAtLabel}
      </p>
      <p style="margin:14px 0 0;font-size:12px;color:#6b7280">
        If you did not expect this email, you can ignore it.<br />
        Support: <a href="mailto:support@activationiq.org">support@activationiq.org</a>
      </p>
    </div>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      reply_to: replyTo ? [replyTo] : undefined,
      to: [input.to],
      subject: `Campaign update: ${input.campaignName}`,
      text,
      html,
    }),
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`Failed to send email: ${payload}`);
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["admin", "super_admin"])) return forbidden();
  const membership = await getOrgMembershipForUser(user.id);
  if (!membership || !hasAllowedOrgRole(membership.role, ["org_admin", "supervisor"])) return forbidden();

  const { id } = await context.params;
  const supabase = createServerSupabaseClient();
  const { data: links, error } = await supabase
    .from("campaign_share_links")
    .select("id, campaign_id, recipient_email, status, expires_at, revoked_at, last_viewed_at, view_count, created_at")
    .eq("organization_id", membership.organizationId)
    .eq("campaign_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  const now = Date.now();
  const rows = (links ?? []).map((row) => ({
    id: row.id,
    campaignId: row.campaign_id,
    recipientEmail: row.recipient_email,
    status: row.status === "active" && new Date(row.expires_at).getTime() < now ? "expired" : row.status,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    lastViewedAt: row.last_viewed_at,
    viewCount: row.view_count ?? 0,
    createdAt: row.created_at,
  }));

  return NextResponse.json({ success: true, shareLinks: rows });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["admin", "super_admin"])) return forbidden();
  const membership = await getOrgMembershipForUser(user.id);
  if (!membership || !hasAllowedOrgRole(membership.role, ["org_admin", "supervisor"])) return forbidden();

  const { id } = await context.params;
  const payload = (await request.json()) as CreateShareLinkPayload;
  const supabase = createServerSupabaseClient();
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, name")
    .eq("id", id)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();
  if (!campaign) {
    return NextResponse.json({ success: false, message: "Campaign not found." }, { status: 404 });
  }

  const expiresAt = payload.expiresAt
    ? new Date(payload.expiresAt).toISOString()
    : new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
  if (new Date(expiresAt).getTime() <= Date.now()) {
    return NextResponse.json({ success: false, message: "Expiry must be in the future." }, { status: 400 });
  }

  const recipientEmail = payload.recipientEmail?.trim() || null;
  if (recipientEmail && !isValidEmail(recipientEmail)) {
    return NextResponse.json({ success: false, message: "Recipient email is invalid." }, { status: 400 });
  }

  const token = generateShareToken();
  const tokenHash = hashShareToken(token);
  const { data: inserted, error } = await supabase
    .from("campaign_share_links")
    .insert({
      organization_id: membership.organizationId,
      campaign_id: id,
      created_by_user_id: user.id,
      token_hash: tokenHash,
      recipient_email: recipientEmail,
      expires_at: expiresAt,
      status: "active",
    })
    .select("id, campaign_id, recipient_email, status, expires_at, revoked_at, last_viewed_at, view_count, created_at")
    .single();

  if (error || !inserted) {
    return NextResponse.json({ success: false, message: error?.message ?? "Failed to create share link." }, { status: 500 });
  }

  const shareUrl = `${resolvePublicBaseUrl(request)}/shared/campaigns/${token}`;
  const orgBrand = await getBrandByOrganizationId(membership.organizationId);
  const brandName = orgBrand?.name ?? "ActivationIQ";
  if (payload.sendEmail) {
    if (!recipientEmail) {
      return NextResponse.json({ success: false, message: "Recipient email is required to send." }, { status: 400 });
    }
    try {
      await sendShareEmail({
        to: recipientEmail,
        campaignName: campaign.name,
        shareUrl,
        expiresAt,
        brandName,
        brandLogoUrl: orgBrand?.logoUrl ?? null,
      });
    } catch (sendError) {
      return NextResponse.json({ success: false, message: (sendError as Error).message }, { status: 500 });
    }
  }

  return NextResponse.json({
    success: true,
    shareLink: {
      id: inserted.id,
      campaignId: inserted.campaign_id,
      recipientEmail: inserted.recipient_email,
      status: inserted.status,
      expiresAt: inserted.expires_at,
      revokedAt: inserted.revoked_at,
      lastViewedAt: inserted.last_viewed_at,
      viewCount: inserted.view_count ?? 0,
      createdAt: inserted.created_at,
      shareUrl,
    },
  });
}
