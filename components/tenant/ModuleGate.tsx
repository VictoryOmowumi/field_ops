"use client";

import type { ReactNode } from "react";
import { useModule } from "@/components/providers/tenant-experience-provider";
import type { ModuleKey } from "@/lib/tenant-experience/types";

type ModuleGateProps = {
  module: ModuleKey;
  children: ReactNode;
  fallback?: ReactNode;
};

// Renders children when the module is enabled for the active tenant.
// When disabled, renders `fallback` if provided, otherwise nothing.
// Use <ModuleGate fallback={<ModuleDisabled />}> for page-section gating,
// and null (default) for nav item gating where absence is the right UX.
export default function ModuleGate({ module, children, fallback = null }: ModuleGateProps) {
  const enabled = useModule(module);
  return enabled ? <>{children}</> : <>{fallback}</>;
}
