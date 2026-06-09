"use client";

import { useMemo } from "react";
import { useTenantExperience, useTerminology } from "@/components/providers/tenant-experience-provider";
import { getBackofficeNav } from "./config";
import type { BackofficeRole, NavAction } from "./types";

// Returns the nav item list for a given role with:
//   - labels resolved through the active tenant's terminology dictionary
//   - items gated by a moduleKey removed when that module is disabled
// Both BackofficeShell and CommandRailShell use this hook so the filtering
// and resolution logic lives in exactly one place.
export function useResolvedNav(role: BackofficeRole): NavAction[] {
  const t = useTerminology();
  const { config } = useTenantExperience();
  const modules = config.modules;

  return useMemo(() => {
    return getBackofficeNav(role)
      .filter((item) => !item.moduleKey || modules[item.moduleKey] !== false)
      .map((item) => ({
        ...item,
        label: item.terminologyKey ? t(item.terminologyKey) : item.label,
      }));
  }, [role, t, modules]);
}
