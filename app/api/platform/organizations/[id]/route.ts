import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["super_admin"])) return forbidden();

  const { id } = await params;
  const supabase = createServerSupabaseClient();

  const { data: organization, error: orgError } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (orgError) {
    return NextResponse.json({ success: false, message: orgError.message }, { status: 500 });
  }
  if (!organization) {
    return NextResponse.json({ success: false, message: "Organization not found." }, { status: 404 });
  }

  const [{ count: userCount }, { count: campaignCount }, { count: outletCount }, { count: salesCount }, { data: evidenceRows }, { count: monthlyVisits }, { count: monthlySales }] = await Promise.all([
    supabase
      .from("organization_users")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", id),
    supabase
      .from("campaigns")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", id),
    supabase
      .from("outlets")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", id),
    supabase
      .from("sales")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", id),
    supabase
      .from("visit_evidence")
      .select("file_size")
      .eq("organization_id", id),
    supabase
      .from("visits")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", id)
      .gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
    supabase
      .from("sales")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", id)
      .gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
  ]);

  const { data: orgAdminMembership } = await supabase
    .from("organization_users")
    .select("user_id")
    .eq("organization_id", id)
    .eq("role", "org_admin")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  let primaryAdminName = "Organization Admin";
  let primaryAdminEmail = organization.primary_contact_email ?? "-";
  let primaryAdminPhone = "-";
  if (orgAdminMembership?.user_id) {
    const { data: adminProfile } = await supabase
      .from("profiles")
      .select("full_name, email, phone")
      .eq("user_id", orgAdminMembership.user_id)
      .maybeSingle();
    if (adminProfile) {
      primaryAdminName = adminProfile.full_name ?? primaryAdminName;
      primaryAdminEmail = adminProfile.email ?? primaryAdminEmail;
      primaryAdminPhone = adminProfile.phone ?? primaryAdminPhone;
    }
  }

  const storageBytes = (evidenceRows ?? []).reduce((sum, row) => sum + (Number(row.file_size ?? 0) || 0), 0);
  const storageGb = storageBytes / (1024 * 1024 * 1024);
  const storageUsage = storageGb >= 1 ? `${storageGb.toFixed(2)} GB` : `${(storageBytes / (1024 * 1024)).toFixed(2)} MB`;
  const monthlyEvents = (monthlyVisits ?? 0) + (monthlySales ?? 0);
  const monthlyActivity = monthlyEvents > 2000 ? "High" : monthlyEvents > 500 ? "Medium" : "Low";

  return NextResponse.json({
    success: true,
    organization: {
      ...organization,
      userCount: userCount ?? 0,
      campaignCount: campaignCount ?? 0,
      outletCount: outletCount ?? 0,
      salesCount: salesCount ?? 0,
      primaryAdminName,
      primaryAdminEmail,
      primaryAdminPhone,
      storageUsage,
      monthlyActivity,
    },
  });
}

type UpdateOrganizationPayload = {
  name?: string;
  slug?: string;
  industry?: string | null;
  businessType?: string | null;
  logoUrl?: string | null;
  website?: string | null;
  primaryContactEmail?: string | null;
  primaryContactPhone?: string | null;
  country?: string | null;
  timezone?: string | null;
  currency?: string | null;
  status?: "active" | "suspended" | "trial" | "archived";
  plan?: "starter" | "growth" | "enterprise";
  billingEmail?: string | null;
  brandPrimaryColor?: string | null;
  brandSecondaryColor?: string | null;
  faviconIcoUrl?: string | null;
  favicon16Url?: string | null;
  favicon32Url?: string | null;
  appleTouchIconUrl?: string | null;
  android192Url?: string | null;
  android512Url?: string | null;
  manifestUrl?: string | null;
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["super_admin"])) return forbidden();

  const { id } = await params;
  const payload = (await request.json()) as UpdateOrganizationPayload;
  const supabase = createServerSupabaseClient();

  const patch: Record<string, unknown> = {};
  if (payload.name !== undefined) patch.name = payload.name.trim();
  if (payload.slug !== undefined) patch.slug = payload.slug.trim().toLowerCase();
  if (payload.industry !== undefined) patch.industry = payload.industry?.trim() || null;
  if (payload.businessType !== undefined) patch.business_type = payload.businessType?.trim() || null;
  if (payload.logoUrl !== undefined) patch.logo_url = payload.logoUrl?.trim() || null;
  if (payload.website !== undefined) patch.website = payload.website?.trim() || null;
  if (payload.primaryContactEmail !== undefined) patch.primary_contact_email = payload.primaryContactEmail?.trim() || null;
  if (payload.primaryContactPhone !== undefined) patch.primary_contact_phone = payload.primaryContactPhone?.trim() || null;
  if (payload.country !== undefined) patch.country = payload.country?.trim() || null;
  if (payload.timezone !== undefined) patch.timezone = payload.timezone?.trim() || null;
  if (payload.currency !== undefined) patch.currency = payload.currency?.trim() || null;
  if (payload.status !== undefined) patch.status = payload.status;
  if (payload.plan !== undefined) patch.plan = payload.plan;
  if (payload.billingEmail !== undefined) patch.billing_email = payload.billingEmail?.trim() || null;
  if (payload.brandPrimaryColor !== undefined) patch.brand_primary_color = payload.brandPrimaryColor?.trim() || null;
  if (payload.brandSecondaryColor !== undefined) patch.brand_secondary_color = payload.brandSecondaryColor?.trim() || null;
  if (payload.faviconIcoUrl !== undefined) patch.brand_favicon_ico_url = payload.faviconIcoUrl?.trim() || null;
  if (payload.favicon16Url !== undefined) patch.brand_favicon_16_url = payload.favicon16Url?.trim() || null;
  if (payload.favicon32Url !== undefined) patch.brand_favicon_32_url = payload.favicon32Url?.trim() || null;
  if (payload.appleTouchIconUrl !== undefined) patch.brand_apple_touch_icon_url = payload.appleTouchIconUrl?.trim() || null;
  if (payload.android192Url !== undefined) patch.brand_android_192_url = payload.android192Url?.trim() || null;
  if (payload.android512Url !== undefined) patch.brand_android_512_url = payload.android512Url?.trim() || null;
  if (payload.manifestUrl !== undefined) patch.brand_manifest_url = payload.manifestUrl?.trim() || null;

  if (patch.slug) {
    const { data: existingSlug } = await supabase
      .from("organizations")
      .select("id")
      .eq("slug", String(patch.slug))
      .neq("id", id)
      .maybeSingle();
    if (existingSlug) {
      return NextResponse.json({ success: false, message: "Organization slug already exists." }, { status: 400 });
    }
  }

  const { data, error } = await supabase
    .from("organizations")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ success: false, message: "Organization not found." }, { status: 404 });
  }

  return NextResponse.json({ success: true, organization: data });
}
