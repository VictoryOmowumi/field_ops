"use client";

import type { ReactNode } from "react";

import { useShellVariant } from "@/components/providers/tenant-experience-provider";
import type { BackofficeRole } from "@/components/backoffice/types";
import ShellRegistry from "@/components/shell/ShellRegistry";

/**
 * Reads the active tenant's configured shell variant and renders through the
 * registry. This is the seam between the (server) layout and the (client,
 * context-driven) Tenant Experience Engine — layouts stay simple and declarative;
 * this component is the only place that resolves "which shell does this org get."
 */
export default function TenantShell({
  role,
  children,
}: {
  role: BackofficeRole;
  children: ReactNode;
}) {
  const shellVariant = useShellVariant();
  return (
    <ShellRegistry variant={shellVariant} role={role}>
      {children}
    </ShellRegistry>
  );
}
