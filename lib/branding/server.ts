import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { OrgBrand } from "@/lib/branding/types";

const ORG_SELECT = "slug, subdomain, name, logo_url, brand_primary_color, brand_secondary_color, brand_favicon_ico_url, brand_favicon_16_url, brand_favicon_32_url, brand_apple_touch_icon_url, brand_android_192_url, brand_android_512_url, brand_manifest_url, experience_config";

// Org branding/experience-config changes rarely (only via the super-admin settings UI) but is
// looked up on nearly every page load and favicon request, so a short TTL cache turns almost all
// of that traffic into zero-DB-round-trip lookups. Only successful lookups are cached — a miss
// (e.g. a typo'd slug) is never cached so a real org created moments later isn't masked.
const CACHE_TTL_MS = 5 * 60 * 1000;
const brandCache = new Map<string, { value: unknown; expiresAt: number }>();

function getCached<T>(key: string): T | undefined {
  const entry = brandCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    brandCache.delete(key);
    return undefined;
  }
  return entry.value as T;
}

function setCached(key: string, value: unknown) {
  brandCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** Call after any write to `organizations` branding/experience_config columns so stale reads can't linger up to the full TTL. */
export function invalidateBrandCache() {
  brandCache.clear();
}

function rowToBrand(data: Record<string, unknown>): OrgBrand {
  const expConfig = (data.experience_config ?? {}) as Record<string, unknown>;
  const theme = (expConfig.theme ?? {}) as Record<string, unknown>;
  const layout = (expConfig.layout ?? {}) as Record<string, unknown>;
  return {
    slug: data.slug as string,
    subdomain: (data.subdomain as string | null) ?? null,
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
  const cacheKey = `slug:${normalized}`;
  const cached = getCached<OrgBrand>(cacheKey);
  if (cached) return cached;

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("organizations")
    .select(ORG_SELECT)
    .eq("slug", normalized)
    .maybeSingle();
  if (error || !data) return null;
  const brand = rowToBrand(data as Record<string, unknown>);
  setCached(cacheKey, brand);
  return brand;
}

export async function getBrandBySubdomain(subdomain: string): Promise<OrgBrand | null> {
  const normalized = subdomain.trim().toLowerCase();
  if (!normalized) return null;
  const cacheKey = `subdomain:${normalized}`;
  const cached = getCached<OrgBrand>(cacheKey);
  if (cached) return cached;

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("organizations")
    .select(ORG_SELECT)
    .eq("subdomain", normalized)
    .maybeSingle();
  if (error || !data) return null;
  const brand = rowToBrand(data as Record<string, unknown>);
  setCached(cacheKey, brand);
  return brand;
}

/** Raw experience_config JSON for SSR hydration of TenantExperienceProvider — avoids the classic→enhanced flash on first sign-in. */
export async function getExperienceConfigBySubdomain(subdomain: string): Promise<unknown | null> {
  const normalized = subdomain.trim().toLowerCase();
  if (!normalized) return null;
  const cacheKey = `expconfig:${normalized}`;
  const cached = getCached<unknown>(cacheKey);
  if (cached !== undefined) return cached;

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("experience_config")
    .eq("subdomain", normalized)
    .maybeSingle();
  if (error || !data) return null;
  const config = data.experience_config ?? null;
  setCached(cacheKey, config);
  return config;
}

export async function getBrandByOrganizationId(organizationId: string): Promise<OrgBrand | null> {
  const cacheKey = `org:${organizationId}`;
  const cached = getCached<OrgBrand>(cacheKey);
  if (cached) return cached;

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("organizations")
    .select(ORG_SELECT)
    .eq("id", organizationId)
    .maybeSingle();
  if (error || !data) return null;
  const brand = rowToBrand(data as Record<string, unknown>);
  setCached(cacheKey, brand);
  return brand;
}
