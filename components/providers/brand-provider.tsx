"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { APP_NAME } from "@/lib/constants";
import {
  BRAND_COOKIE_LOGO,
  BRAND_COOKIE_NAME,
  BRAND_COOKIE_SLUG,
  type OrgBrand,
} from "@/lib/branding/types";
import { COLOR_PRESET_REGISTRY } from "@/lib/tenant-experience/theme-presets";

const BRAND_STYLE_ID = "actiq-tenant-theme";
const BRAND_FONT_LINK_ID = "actiq-tenant-font";

function parseFontFamily(url: string): string | null {
  try {
    const params = new URL(url).searchParams.getAll("family");
    return params[0]?.split(":")[0]?.trim() || null;
  } catch { return null; }
}

// Apply color+font CSS overrides from the public brand data (pre-auth).
// TenantThemeApplier (post-auth) will overwrite this once the full config loads.
function applyBrandTheme(colorPreset: string | null | undefined, fontUrl: string | null | undefined) {
  if (typeof document === "undefined") return;
  const colorEntry = colorPreset ? (COLOR_PRESET_REGISTRY[colorPreset] ?? null) : null;

  // Font link
  const existingLink = document.getElementById(BRAND_FONT_LINK_ID);
  if (fontUrl) {
    if (!(existingLink instanceof HTMLLinkElement) || existingLink.href !== fontUrl) {
      existingLink?.remove();
      const link = document.createElement("link");
      link.id = BRAND_FONT_LINK_ID;
      link.rel = "stylesheet";
      link.href = fontUrl;
      document.head.appendChild(link);
    }
  } else {
    existingLink?.remove();
  }

  const fontFamily = fontUrl ? parseFontFamily(fontUrl) : null;
  if (!colorEntry && !fontFamily) {
    document.getElementById(BRAND_STYLE_ID)?.remove();
    return;
  }

  let el = document.getElementById(BRAND_STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = BRAND_STYLE_ID;
    document.head.appendChild(el);
  }

  const fontLine = fontFamily ? `  --font-sans: '${fontFamily}', sans-serif;` : "";
  const lightVars = [
    fontLine,
    ...(colorEntry ? Object.entries(colorEntry.light).map(([k, v]) => `  ${k}: ${v};`) : []),
  ].filter(Boolean).join("\n");
  const darkVars = colorEntry
    ? Object.entries(colorEntry.dark).map(([k, v]) => `  ${k}: ${v};`).join("\n")
    : "";

  el.textContent = `:root {\n${lightVars}\n}${darkVars ? `\n.dark {\n${darkVars}\n}` : ""}`;
}

type BrandContextValue = {
  brandName: string;
  logoUrl: string | null;
  orgSlug: string | null;
  loading: boolean;
};

const STORAGE_KEY = "actiq_brand";
const BRAND_CACHE_TTL_MS = 1000 * 60 * 60 * 24;

const BrandContext = createContext<BrandContextValue>({
  brandName: APP_NAME,
  logoUrl: null,
  orgSlug: null,
  loading: false,
});

function writeBrandCookies(brand: { slug: string | null; name: string; logoUrl: string | null }) {
  if (typeof document === "undefined") return;
  const maxAge = 60 * 60 * 24 * 30;
  if (brand.slug) document.cookie = `${BRAND_COOKIE_SLUG}=${encodeURIComponent(brand.slug)}; path=/; max-age=${maxAge}; samesite=lax`;
  document.cookie = `${BRAND_COOKIE_NAME}=${encodeURIComponent(brand.name)}; path=/; max-age=${maxAge}; samesite=lax`;
  document.cookie = `${BRAND_COOKIE_LOGO}=${encodeURIComponent(brand.logoUrl ?? "")}; path=/; max-age=${maxAge}; samesite=lax`;
}

export function BrandProvider({ children, initialSubdomain }: { children: React.ReactNode; initialSubdomain?: string | null }) {
  const [brand, setBrand] = useState<BrandContextValue>(() => {
    if (typeof window === "undefined") {
      return { brandName: APP_NAME, logoUrl: null, orgSlug: null, loading: false };
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const stored = raw ? (JSON.parse(raw) as { slug?: string; name?: string; logoUrl?: string | null; version?: string | null; cachedAt?: number }) : null;
      const isFresh = typeof stored?.cachedAt === "number" && Date.now() - stored.cachedAt < BRAND_CACHE_TTL_MS;
      if (stored?.name && isFresh) {
        return {
          brandName: stored.name,
          logoUrl: stored.logoUrl ?? null,
          orgSlug: stored.slug ?? null,
          loading: false,
        };
      }
    } catch {
      // no-op
    }
    return { brandName: APP_NAME, logoUrl: null, orgSlug: null, loading: false };
  });

  useEffect(() => {
    async function loadBrand() {
      setBrand((previous) => ({ ...previous, loading: true }));
      try {
        const { supabaseClient } = await import("@/lib/supabase/client");
        const sessionResult = await supabaseClient.auth.getSession();
        const token = sessionResult.data.session?.access_token;
        if (token) {
          const response = await fetch("/api/auth/context", {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          });
          if (response.ok) {
            const payload = (await response.json()) as {
              success: boolean;
              user?: {
                memberships?: Array<{
                  status?: string;
                  organizations?: {
                    name?: string | null;
                    slug?: string | null;
                    logo_url?: string | null;
                    updated_at?: string | null;
                  };
                }>;
              };
            };
            const activeMembership = (payload.user?.memberships ?? []).find((item) => item.status === "active")
              ?? (payload.user?.memberships ?? [])[0];
            const orgName = activeMembership?.organizations?.name?.trim();
            if (orgName) {
              const version = activeMembership?.organizations?.updated_at ?? null;
              const rawStored = localStorage.getItem(STORAGE_KEY);
              const stored = rawStored
                ? (JSON.parse(rawStored) as { slug?: string; name?: string; logoUrl?: string | null; version?: string | null; cachedAt?: number })
                : null;
              if (
                stored?.name === orgName &&
                stored?.slug === (activeMembership?.organizations?.slug ?? null) &&
                stored?.logoUrl === (activeMembership?.organizations?.logo_url ?? null) &&
                stored?.version === version &&
                typeof stored?.cachedAt === "number" &&
                Date.now() - stored.cachedAt < BRAND_CACHE_TTL_MS
              ) {
                setBrand({
                  brandName: stored.name,
                  logoUrl: stored.logoUrl ?? null,
                  orgSlug: stored.slug ?? null,
                  loading: false,
                });
                writeBrandCookies({
                  slug: stored.slug ?? null,
                  name: stored.name,
                  logoUrl: stored.logoUrl ?? null,
                });
                return;
              }
              const next = {
                brandName: orgName,
                logoUrl: activeMembership?.organizations?.logo_url ?? null,
                orgSlug: activeMembership?.organizations?.slug ?? null,
                loading: false,
              };
              setBrand(next);
              localStorage.setItem(STORAGE_KEY, JSON.stringify({
                slug: next.orgSlug,
                name: next.brandName,
                logoUrl: next.logoUrl,
                version,
                cachedAt: Date.now(),
              }));
              writeBrandCookies({
                slug: next.orgSlug,
                name: next.brandName,
                logoUrl: next.logoUrl,
              });
              return;
            }
          }
        }

        // Detect subdomain from hostname for portal tenants (e.g., iminndx.activationiq.org)
        const hostname = window.location.hostname;
        const hostParts = hostname.split(".");
        const detectedSubdomain = hostParts.length >= 3 ? hostParts[0] : null;
        const subdomain = initialSubdomain ?? detectedSubdomain;

        if (subdomain) {
          const response = await fetch(`/api/public/brand?subdomain=${encodeURIComponent(subdomain)}`, { cache: "no-store" });
          if (response.ok) {
            const payload = (await response.json()) as { success: boolean; brand?: OrgBrand };
            if (payload.success && payload.brand) {
              const next = {
                brandName: payload.brand.name || APP_NAME,
                logoUrl: payload.brand.logoUrl ?? null,
                orgSlug: payload.brand.slug ?? null,
                loading: false,
              };
              setBrand(next);
              applyBrandTheme(payload.brand.colorPreset, payload.brand.fontUrl);
              localStorage.setItem(STORAGE_KEY, JSON.stringify({
                slug: next.orgSlug,
                name: next.brandName,
                logoUrl: next.logoUrl,
                version: null,
                cachedAt: Date.now(),
              }));
              writeBrandCookies({ slug: next.orgSlug, name: next.brandName, logoUrl: next.logoUrl });
              return;
            }
          }
        }

        const params = new URLSearchParams(window.location.search);
        const querySlug = params.get("org")?.trim().toLowerCase() || null;
        if (querySlug) {
          const response = await fetch(`/api/public/brand?org=${encodeURIComponent(querySlug)}`, { cache: "no-store" });
          if (response.ok) {
            const payload = (await response.json()) as { success: boolean; brand?: OrgBrand };
            if (payload.success && payload.brand) {
              const next = {
                brandName: payload.brand.name || APP_NAME,
                logoUrl: payload.brand.logoUrl ?? null,
                orgSlug: payload.brand.slug ?? querySlug,
                loading: false,
              };
              setBrand(next);
              // Apply pre-auth theme so login page shows correct colors/font
              applyBrandTheme(payload.brand.colorPreset, payload.brand.fontUrl);
              localStorage.setItem(STORAGE_KEY, JSON.stringify({
                slug: next.orgSlug,
                name: next.brandName,
                logoUrl: next.logoUrl,
                version: null,
                cachedAt: Date.now(),
              }));
              writeBrandCookies({
                slug: next.orgSlug,
                name: next.brandName,
                logoUrl: next.logoUrl,
              });
              return;
            }
          }
        }

        const fallback = { brandName: APP_NAME, logoUrl: null, orgSlug: null, loading: false };
        setBrand(fallback);
        localStorage.removeItem(STORAGE_KEY);
        writeBrandCookies({ slug: null, name: APP_NAME, logoUrl: null });
      } catch {
        const fallback = { brandName: APP_NAME, logoUrl: null, orgSlug: null, loading: false };
        setBrand(fallback);
      }
    }

    void loadBrand();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSubdomain]);

  const value = useMemo(() => brand, [brand]);
  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export function useBrand() {
  return useContext(BrandContext);
}
