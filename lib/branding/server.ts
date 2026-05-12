import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { OrgBrand } from "@/lib/branding/types";

export async function getBrandBySlug(slug: string): Promise<OrgBrand | null> {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return null;
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("slug, name, logo_url, brand_primary_color, brand_secondary_color, brand_favicon_ico_url, brand_favicon_16_url, brand_favicon_32_url, brand_apple_touch_icon_url, brand_android_192_url, brand_android_512_url, brand_manifest_url")
    .eq("slug", normalized)
    .maybeSingle();
  if (error || !data) return null;
  return {
    slug: data.slug,
    name: data.name,
    logoUrl: data.logo_url ?? null,
    brandPrimaryColor: data.brand_primary_color ?? null,
    brandSecondaryColor: data.brand_secondary_color ?? null,
    faviconIcoUrl: data.brand_favicon_ico_url ?? null,
    favicon16Url: data.brand_favicon_16_url ?? null,
    favicon32Url: data.brand_favicon_32_url ?? null,
    appleTouchIconUrl: data.brand_apple_touch_icon_url ?? null,
    android192Url: data.brand_android_192_url ?? null,
    android512Url: data.brand_android_512_url ?? null,
    manifestUrl: data.brand_manifest_url ?? null,
  };
}

export async function getBrandByOrganizationId(organizationId: string): Promise<OrgBrand | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("slug, name, logo_url, brand_primary_color, brand_secondary_color, brand_favicon_ico_url, brand_favicon_16_url, brand_favicon_32_url, brand_apple_touch_icon_url, brand_android_192_url, brand_android_512_url, brand_manifest_url")
    .eq("id", organizationId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    slug: data.slug,
    name: data.name,
    logoUrl: data.logo_url ?? null,
    brandPrimaryColor: data.brand_primary_color ?? null,
    brandSecondaryColor: data.brand_secondary_color ?? null,
    faviconIcoUrl: data.brand_favicon_ico_url ?? null,
    favicon16Url: data.brand_favicon_16_url ?? null,
    favicon32Url: data.brand_favicon_32_url ?? null,
    appleTouchIconUrl: data.brand_apple_touch_icon_url ?? null,
    android192Url: data.brand_android_192_url ?? null,
    android512Url: data.brand_android_512_url ?? null,
    manifestUrl: data.brand_manifest_url ?? null,
  };
}
