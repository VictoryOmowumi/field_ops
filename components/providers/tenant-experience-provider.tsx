"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { resolveTenantExperienceConfig } from "@/lib/tenant-experience/resolve";
import {
  DEFAULT_TENANT_EXPERIENCE_CONFIG,
  type ModuleKey,
  type TenantExperienceConfig,
  type TerminologyKey,
  type UiVariant,
} from "@/lib/tenant-experience/types";
import { TenantThemeApplier } from "./TenantThemeApplier";

type TenantExperienceContextValue = {
  config: TenantExperienceConfig;
  orgSlug: string | null;
  loading: boolean;
};

const STORAGE_KEY = "actiq_tenant_experience";
const CACHE_TTL_MS = 1000 * 60 * 60 * 24;

// Default context value IS the platform default config — by design. Because
// DEFAULT_TENANT_EXPERIENCE_CONFIG mirrors IMINNDX's shipped behavior exactly,
// every consumer renders correctly before the network resolves, with zero flash.
const TenantExperienceContext = createContext<TenantExperienceContextValue>({
  config: DEFAULT_TENANT_EXPERIENCE_CONFIG,
  orgSlug: null,
  loading: false,
});

type CachedExperience = {
  orgId?: string | null;
  slug?: string | null;
  version?: string | null;
  overrides?: unknown;
  cachedAt?: number;
};

function readCache(): CachedExperience | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CachedExperience) : null;
  } catch {
    return null;
  }
}

function writeCache(entry: CachedExperience) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...entry, cachedAt: Date.now() }));
  } catch {
    // no-op — cache is a perf optimization, not a correctness dependency
  }
}

export function TenantExperienceProvider({
  children,
  initialExperienceConfig = null,
}: {
  children: React.ReactNode;
  initialExperienceConfig?: unknown;
}) {
  const [state, setState] = useState<TenantExperienceContextValue>(() => {
    const cached = readCache();
    const isFresh = typeof cached?.cachedAt === "number" && Date.now() - cached.cachedAt < CACHE_TTL_MS;
    if (cached && isFresh) {
      return {
        config: resolveTenantExperienceConfig(cached.overrides),
        orgSlug: cached.slug ?? null,
        loading: false,
      };
    }
    // SSR-resolved config from the subdomain (no auth needed) — renders the
    // correct ui variant on first paint, before any client cache exists.
    if (initialExperienceConfig) {
      return {
        config: resolveTenantExperienceConfig(initialExperienceConfig),
        orgSlug: null,
        loading: false,
      };
    }
    return { config: DEFAULT_TENANT_EXPERIENCE_CONFIG, orgSlug: null, loading: false };
  });

  useEffect(() => {
    let cancelled = false;

    async function loadExperienceConfig() {
      try {
        const { supabaseClient } = await import("@/lib/supabase/client");
        const sessionResult = await supabaseClient.auth.getSession();
        const token = sessionResult.data.session?.access_token;
        if (!token) return;

        const response = await fetch("/api/auth/context", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!response.ok || cancelled) return;

        const payload = (await response.json()) as {
          success: boolean;
          user?: {
            memberships?: Array<{
              status?: string;
              organization_id?: string;
              organizations?: {
                slug?: string | null;
                updated_at?: string | null;
                experience_config?: unknown;
              };
            }>;
          };
        };

        const memberships = payload.user?.memberships ?? [];
        const activeMembership = memberships.find((item) => item.status === "active") ?? memberships[0];
        const org = activeMembership?.organizations;
        if (!org || cancelled) return;

        const overrides = org.experience_config ?? null;
        const slug = org.slug ?? null;
        const version = org.updated_at ?? null;

        setState({
          config: resolveTenantExperienceConfig(overrides),
          orgSlug: slug,
          loading: false,
        });
        writeCache({ orgId: activeMembership?.organization_id ?? null, slug, version, overrides });
      } catch {
        // Resolution failure falls back to the platform default — which matches
        // current behavior, so there is no degraded state to handle here.
      }
    }

    void loadExperienceConfig();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <TenantExperienceContext.Provider value={state}>
      <TenantThemeApplier />
      {children}
    </TenantExperienceContext.Provider>
  );
}

export function useTenantExperience() {
  return useContext(TenantExperienceContext);
}

/**
 * Resolves a terminology key through the active tenant's dictionary.
 * Usage: const t = useTerminology(); t("outlet") -> "Outlet" (IMINNDX) or "Store" (another tenant).
 * Always returns a string — falls back to the platform default label for the key,
 * and finally to the raw key, so a missing dictionary entry never renders blank.
 */
export function useTerminology() {
  const { config } = useTenantExperience();
  return useMemo(() => {
    return function t(key: TerminologyKey): string {
      return (
        config.terminology[key]
        ?? DEFAULT_TENANT_EXPERIENCE_CONFIG.terminology[key]
        ?? key
      );
    };
  }, [config.terminology]);
}

/**
 * Returns whether a module is enabled for the active tenant. Defaults to enabled
 * (matching today's behavior, where every module ships to every org) unless the
 * tenant config explicitly disables it.
 */
export function useModule(key: ModuleKey): boolean {
  const { config } = useTenantExperience();
  return config.modules[key] !== false;
}

export function useShellVariant() {
  const { config } = useTenantExperience();
  return config.layout.shellVariant;
}

/**
 * Returns the active tenant's UI variant ("classic" | "enhanced").
 * Used to gate enhanced admin and shared-view layouts. Defaults to "classic"
 * so existing tenants are unaffected until they explicitly opt in.
 */
export function useUiVariant(): UiVariant {
  const { config } = useTenantExperience();
  return config.layout.uiVariant;
}
