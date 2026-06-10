import type { MetadataRoute } from "next";
import { cookies, headers } from "next/headers";

import { getBrandBySlug, getBrandBySubdomain } from "@/lib/branding/server";
import { APP_NAME } from "@/lib/constants";
import { BRAND_COOKIE_SLUG, BRAND_COOKIE_NAME } from "@/lib/branding/types";

// Hex equivalents of each TenantColorPreset — used for theme_color + splash background.
// Must stay in sync with COLOR_PRESETS in the experience config page.
const PRESET_HEX: Record<string, string> = {
  default: "#d4712a",
  blue:    "#2563eb",
  green:   "#16a34a",
  purple:  "#7c3aed",
  slate:   "#475569",
  red:     "#dc2626",
  teal:    "#0d9488",
  amber:   "#d97706",
  rose:    "#e11d48",
  navy:    "#1e3a5f",
};

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const store = await cookies();
  const headersList = await headers();
  const cookieName = store.get(BRAND_COOKIE_NAME)?.value || APP_NAME;
  const slug = store.get(BRAND_COOKIE_SLUG)?.value || "";
  // Subdomain is set by the proxy from the request host — authoritative even
  // before the brand cookie is populated client-side (e.g. first PWA install).
  const tenantSubdomain = headersList.get("x-tenant-subdomain") || "";

  // Fetch brand — gives us the real org name, color preset, and primary color.
  // Prefer subdomain (works pre-cookie); fall back to the brand cookie slug.
  const brand = tenantSubdomain
    ? await getBrandBySubdomain(tenantSubdomain)
    : slug
    ? await getBrandBySlug(slug)
    : null;

  const appName = brand?.name ?? cookieName;
  // Keep short_name ≤ 12 chars — Android launcher truncates beyond that.
  const shortName = appName.length > 12 ? appName.split(/\s+/)[0]! : appName;

  // Resolve theme color: color preset → hex → brandPrimaryColor → platform default.
  const themeColor =
    (brand?.colorPreset && brand.colorPreset !== "default"
      ? (PRESET_HEX[brand.colorPreset] ?? null)
      : null)
    ?? brand?.brandPrimaryColor
    ?? PRESET_HEX.default;

  const iconQueryParam = tenantSubdomain
    ? `subdomain=${encodeURIComponent(tenantSubdomain)}`
    : slug
    ? `org=${encodeURIComponent(slug)}`
    : "";
  const orgParam = iconQueryParam ? `&${iconQueryParam}` : "";
  const iconOrg  = iconQueryParam ? `?${iconQueryParam}` : "";
  const manifestStart = slug ? `/login?org=${encodeURIComponent(slug)}` : "/login";

  return {
    name: appName,
    short_name: shortName,
    description: `${appName} field sales activation and sync platform`,
    start_url: manifestStart,
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: themeColor,
    categories: ["business", "productivity"],
    icons: [
      {
        src: `/api/public/brand/icon?size=192${orgParam}`,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `/api/public/brand/icon?size=512${orgParam}`,
        sizes: "512x512",
        type: "image/png",
        // "maskable" enables Android adaptive icons (safe-zone crop applied by OS).
        purpose: "maskable",
      },
      {
        // 180×180 covers the iOS apple-touch-icon size via manifest (Chrome on iOS).
        src: `/api/public/brand/icon${iconOrg}`,
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
    shortcuts: [
      { name: "Campaigns", short_name: "Campaigns", url: "/agent/campaigns" },
      { name: "Sync Queue", short_name: "Sync",      url: "/agent/sync" },
    ],
  };
}
