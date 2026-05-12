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
    async function loadBrand() {
      setBrand((previous) => ({ ...previous, loading: true }));
      try {
        const { supabaseClient } = await import("@/lib/supabase/client");
        const sessionResult = await supabaseClient.auth.getSession();
        const token = sessionResult.data.session?.access_token;
        if (token) {
          const response = await fetch("/api/auth/context", {
            headers: { Authorization: `Bearer ${token}` },
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
                  };
                }>;
              };
            };
            const activeMembership = (payload.user?.memberships ?? []).find((item) => item.status === "active")
              ?? (payload.user?.memberships ?? [])[0];
            const orgName = activeMembership?.organizations?.name?.trim();
            if (orgName) {
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

        const params = new URLSearchParams(window.location.search);
        const querySlug = params.get("org")?.trim().toLowerCase() || null;
        if (querySlug) {
          const response = await fetch(`/api/public/brand?org=${encodeURIComponent(querySlug)}`);
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
  }, []);

  const value = useMemo(() => brand, [brand]);
  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export function useBrand() {
  return useContext(BrandContext);
}
