import { createServerSupabaseClient } from "@/lib/supabase/server";

export type OrganizationView = {
  id: string;
  name: string;
  slug: string;
  industry: string;
  businessType: string;
  logoUrl?: string;
  website?: string;
  primaryContactEmail: string;
  primaryContactPhone: string;
  primaryAdminName: string;
  primaryAdminEmail: string;
  primaryAdminPhone: string;
  country: string;
  timezone: string;
  currency: string;
  status: string;
  plan: string;
  billingEmail?: string;
  brandPrimaryColor?: string;
  brandSecondaryColor?: string;
  createdAt: string;
  totalCampaigns: number;
  totalReps: number;
  totalOutlets: number;
  totalSales: number;
  storageUsage: string;
  monthlyActivity: string;
};

function titleCase(value: string | null | undefined) {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export async function getOrganizationViewById(id: string): Promise<OrganizationView | null> {
  const supabase = createServerSupabaseClient();

  const { data: organization, error } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !organization) return null;

  const [{ count: totalCampaigns }, { count: totalReps }, { count: totalOutlets }, { count: totalSales }] = await Promise.all([
    supabase.from("campaigns").select("id", { count: "exact", head: true }).eq("organization_id", id),
    supabase.from("organization_users").select("id", { count: "exact", head: true }).eq("organization_id", id).eq("role", "agent"),
    supabase.from("outlets").select("id", { count: "exact", head: true }).eq("organization_id", id),
    supabase.from("sales").select("id", { count: "exact", head: true }).eq("organization_id", id),
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
  let primaryAdminEmail = organization.primary_contact_email ?? "";
  let primaryAdminPhone = "";

  if (orgAdminMembership?.user_id) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email, phone")
      .eq("user_id", orgAdminMembership.user_id)
      .maybeSingle();
    if (profile) {
      primaryAdminName = profile.full_name ?? primaryAdminName;
      primaryAdminEmail = profile.email ?? primaryAdminEmail;
      primaryAdminPhone = profile.phone ?? "";
    }
  }

  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    industry: organization.industry ?? "-",
    businessType: organization.business_type ?? "-",
    logoUrl: organization.logo_url ?? undefined,
    website: organization.website ?? undefined,
    primaryContactEmail: organization.primary_contact_email ?? "-",
    primaryContactPhone: organization.primary_contact_phone ?? "-",
    primaryAdminName,
    primaryAdminEmail: primaryAdminEmail || "-",
    primaryAdminPhone: primaryAdminPhone || "-",
    country: organization.country ?? "Nigeria",
    timezone: organization.timezone ?? "Africa/Lagos",
    currency: organization.currency ?? "NGN",
    status: titleCase(organization.status) || "Active",
    plan: titleCase(organization.plan) || "Starter",
    billingEmail: organization.billing_email ?? undefined,
    brandPrimaryColor: organization.brand_primary_color ?? undefined,
    brandSecondaryColor: organization.brand_secondary_color ?? undefined,
    createdAt: new Date(organization.created_at).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
    }),
    totalCampaigns: totalCampaigns ?? 0,
    totalReps: totalReps ?? 0,
    totalOutlets: totalOutlets ?? 0,
    totalSales: totalSales ?? 0,
    storageUsage: "0 GB",
    monthlyActivity: (totalSales ?? 0) > 500 ? "High" : (totalSales ?? 0) > 100 ? "Medium" : "Low",
  };
}
