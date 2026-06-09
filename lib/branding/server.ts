import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { OrgBrand } from "@/lib/branding/types";

const ORG_SELECT = "slug, name, logo_url, brand_primary_color, brand_secondary_color, brand_favicon_ico_url, brand_favicon_16_url, brand_favicon_32_url, brand_apple_touch_icon_url, brand_android_192_url, brand_android_512_url, brand_manifest_url, experience_config";

function rowToBrand(data: Record<string, unknown>): OrgBrand {
  const expConfig = (data.experience_config ?? {}) as Record<string, unknown>;
  const theme = (expConfig.theme ?? {}) as Record<string, unknown>;
  const layout = (expConfig.layout ?? {}) as Record<string, unknown>;
  return {
    slug: data.slug as string,
    name: data.name as string,
    logoUrl: (data.logo_url as string | null) ?? null,
    brandPrimaryColor: (data.brand_primary_color as string | null) ?? null,
    brandSecondaryColor: (data.brand_secondary_color as string | null) ?? null,
    faviconIcoUrl: (data.brand_favicon_ico_url as string | null) ?? null,
    favicon16Url: (data.brand_favicon_16_url as string | null) ?? null,
    favicon32Url: (data.brand_favicon_32_url as string | null) ?? null,
    appleTouchIconUrl: (data.brand_apple_touch_icon_url as string | null) ?? null,
    android192Url: (data.brand_android_192_url as string | null) ?? null,
    android512Url: (data.brand_android_512_url as string | null) ?? null,
    manifestUrl: (data.brand_manifest_url as string | null) ?? null,
    colorPreset: (theme.colorPreset as string | null) ?? null,
    fontUrl: (theme.fontUrl as string | null) ?? null,
    uiVariant: (layout.uiVariant as string | null) ?? null,
  };
}

export async function getBrandBySlug(slug: string): Promise<OrgBrand | null> {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return null;
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("organizations")
    .select(ORG_SELECT)
    .eq("slug", normalized)
    .maybeSingle();
  if (error || !data) return null;
  return rowToBrand(data as Record<string, unknown>);
}

export async function getBrandBySubdomain(subdomain: string): Promise<OrgBrand | null> {
  const normalized = subdomain.trim().toLowerCase();
  if (!normalized) return null;
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("organizations")
    .select(ORG_SELECT)
    .eq("subdomain", normalized)
    .maybeSingle();
  if (error || !data) return null;
  return rowToBrand(data as Record<string, unknown>);
}

export async function getBrandByOrganizationId(organizationId: string): Promise<OrgBrand | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("organizations")
    .select(ORG_SELECT)
    .eq("id", organizationId)
    .maybeSingle();
  if (error || !data) return null;
  return rowToBrand(data as Record<string, unknown>);
}
