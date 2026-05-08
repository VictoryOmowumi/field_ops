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
