"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { APP_NAME } from "@/lib/constants";
import {
  BRAND_COOKIE_LOGO,
  BRAND_COOKIE_NAME,
  BRAND_COOKIE_SLUG,
  type OrgBrand,
} from "@/lib/branding/types";

type BrandContextValue = {
  brandName: string;
  logoUrl: string | null;
  orgSlug: string | null;
  loading: boolean;
};

const STORAGE_KEY = "actiq_brand";

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

export function BrandProvider({ children }: { children: React.ReactNode }) {
  const [brand, setBrand] = useState<BrandContextValue>(() => {
    if (typeof window === "undefined") {
      return { brandName: APP_NAME, logoUrl: null, orgSlug: null, loading: false };
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const stored = raw ? (JSON.parse(raw) as { slug?: string; name?: string; logoUrl?: string | null }) : null;
      if (stored?.name) {
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
    const params = new URLSearchParams(window.location.search);
    const querySlug = params.get("org")?.trim().toLowerCase() || null;
    let stored: { slug?: string; name?: string; logoUrl?: string | null } | null = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      stored = raw ? (JSON.parse(raw) as { slug?: string; name?: string; logoUrl?: string | null }) : null;
    } catch {
      stored = null;
    }

    if (!querySlug && stored?.name) {
      writeBrandCookies({ slug: stored.slug ?? null, name: stored.name, logoUrl: stored.logoUrl ?? null });
      return;
    }

    if (!querySlug) return;

    fetch(`/api/public/brand?org=${encodeURIComponent(querySlug)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("brand-not-found");
        const payload = (await response.json()) as { success: boolean; brand?: OrgBrand };
        if (!payload.success || !payload.brand) throw new Error("brand-not-found");
        const next = {
          brandName: payload.brand.name || APP_NAME,
          logoUrl: payload.brand.logoUrl ?? null,
          orgSlug: payload.brand.slug ?? querySlug,
          loading: false,
        };
        setBrand(next);
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          slug: next.orgSlug,
          name: next.brandName,
          logoUrl: next.logoUrl,
        }));
        writeBrandCookies({
          slug: next.orgSlug,
          name: next.brandName,
          logoUrl: next.logoUrl,
        });
      })
      .catch(() => {
        const fallback = { brandName: APP_NAME, logoUrl: null, orgSlug: null, loading: false };
        setBrand(fallback);
        localStorage.removeItem(STORAGE_KEY);
        writeBrandCookies({ slug: null, name: APP_NAME, logoUrl: null });
      });
  }, []);

  const value = useMemo(() => brand, [brand]);
  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export function useBrand() {
  return useContext(BrandContext);
}
