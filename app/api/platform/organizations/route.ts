import { NextRequest, NextResponse } from "next/server";

import { hasRequiredRole, getAuthenticatedUserFromRequest } from "@/lib/auth/server-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type CreateOrganizationPayload = {
  name: string;
  slug: string;
  industry?: string;
  businessType?: string;
  logoUrl?: string;
  website?: string;
  primaryContactEmail?: string;
  primaryContactPhone?: string;
  primaryAdminName: string;
  primaryAdminEmail: string;
  primaryAdminPhone?: string;
  country?: string;
  timezone?: string;
  currency?: string;
  status?: "active" | "suspended" | "trial" | "archived";
  plan?: "starter" | "growth" | "enterprise";
  billingEmail?: string;
  brandPrimaryColor?: string;
  brandSecondaryColor?: string;
};

function resolveBaseUrl(request: NextRequest) {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (envUrl) return envUrl;
  const origin = request.headers.get("origin");
  if (origin) return origin;
  return "http://localhost:3000";
}

function badRequest(message: string) {
  return NextResponse.json({ success: false, message }, { status: 400 });
}

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["super_admin"])) return forbidden();

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, organizations: data ?? [] });
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["super_admin"])) return forbidden();

  const body = (await request.json()) as Partial<CreateOrganizationPayload>;

  if (!body.name?.trim()) return badRequest("Organization name is required.");
  if (!body.slug?.trim()) return badRequest("Organization slug is required.");
  if (!body.primaryAdminName?.trim()) return badRequest("Primary admin name is required.");
  if (!body.primaryAdminEmail?.trim()) return badRequest("Primary admin email is required.");

  const supabase = createServerSupabaseClient();
  const baseUrl = resolveBaseUrl(request);

  const normalizedSlug = body.slug.trim().toLowerCase();
  const { data: existingOrg } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", normalizedSlug)
    .maybeSingle();
  if (existingOrg) return badRequest("Organization slug already exists.");

  const { data: organization, error: orgError } = await supabase
    .from("organizations")
    .insert({
      name: body.name.trim(),
      slug: normalizedSlug,
      industry: body.industry?.trim() || null,
      business_type: body.businessType?.trim() || null,
      logo_url: body.logoUrl?.trim() || null,
      website: body.website?.trim() || null,
      primary_contact_email: body.primaryContactEmail?.trim() || null,
      primary_contact_phone: body.primaryContactPhone?.trim() || null,
      country: body.country?.trim() || "Nigeria",
      timezone: body.timezone?.trim() || "Africa/Lagos",
      currency: body.currency?.trim() || "NGN",
      status: body.status || "active",
      plan: body.plan || "starter",
      billing_email: body.billingEmail?.trim() || null,
      brand_primary_color: body.brandPrimaryColor?.trim() || null,
      brand_secondary_color: body.brandSecondaryColor?.trim() || null,
    })
    .select("*")
    .single();

  if (orgError || !organization) {
    return NextResponse.json(
      { success: false, message: orgError?.message || "Failed to create organization." },
      { status: 500 }
    );
  }

  const { data: invitedAuthUser, error: inviteError } =
    await supabase.auth.admin.inviteUserByEmail(body.primaryAdminEmail.trim(), {
      data: {
        full_name: body.primaryAdminName.trim(),
        phone: body.primaryAdminPhone?.trim() || null,
        role: "admin",
        org_role: "org_admin",
      },
      redirectTo: `${baseUrl}/accept-invite`,
    });

  if (inviteError || !invitedAuthUser.user) {
    await supabase.from("organizations").delete().eq("id", organization.id);
    return NextResponse.json(
      {
        success: false,
        message: inviteError?.message || "Failed to invite organization admin.",
      },
      { status: 500 }
    );
  }

  const adminUser = invitedAuthUser.user;

  const { error: metadataError } = await supabase.auth.admin.updateUserById(adminUser.id, {
    app_metadata: { role: "admin" },
    user_metadata: {
      full_name: body.primaryAdminName.trim(),
      phone: body.primaryAdminPhone?.trim() || null,
      role: "admin",
      org_role: "org_admin",
    },
  });

  if (metadataError) {
    await supabase.auth.admin.deleteUser(adminUser.id);
    await supabase.from("organizations").delete().eq("id", organization.id);
    return NextResponse.json(
      { success: false, message: metadataError.message },
      { status: 500 }
    );
  }

  const { error: profileError } = await supabase.from("profiles").upsert({
    user_id: adminUser.id,
    full_name: body.primaryAdminName.trim(),
    email: body.primaryAdminEmail.trim(),
    phone: body.primaryAdminPhone?.trim() || null,
  });

  if (profileError) {
    await supabase.auth.admin.deleteUser(adminUser.id);
    await supabase.from("organizations").delete().eq("id", organization.id);
    return NextResponse.json(
      { success: false, message: profileError.message },
      { status: 500 }
    );
  }

  const { error: membershipError } = await supabase.from("organization_users").insert({
    organization_id: organization.id,
    user_id: adminUser.id,
    role: "org_admin",
    status: "invited",
    invite_sent_at: new Date().toISOString(),
    accepted_at: null,
  });

  if (membershipError) {
    await supabase.auth.admin.deleteUser(adminUser.id);
    await supabase.from("organizations").delete().eq("id", organization.id);
    return NextResponse.json(
      { success: false, message: membershipError.message },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      success: true,
      organization,
      adminUserId: adminUser.id,
    },
    { status: 201 }
  );
}
