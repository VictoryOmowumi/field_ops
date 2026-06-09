import type { ComponentType, ReactNode } from "react";

import BackofficeShell from "@/components/backoffice/BackofficeShell";
import CommandRailShell from "./CommandRailShell";
import SidebarShell from "./SidebarShell";
import type { BackofficeRole } from "@/components/backoffice/types";
import type { ShellVariant } from "@/lib/tenant-experience/types";

// Every shell variant receives the same contract — the props a layout already has
// on hand (role, children) plus whatever the shell itself needs to render its nav.
// New variants register here; nothing outside this file should ever switch on
// `shellVariant` directly. That discipline is what keeps "a different experience"
// from turning into "a different conditional in every shared component."
export type ShellProps = {
  role: BackofficeRole;
  children: ReactNode;
};

const SHELL_REGISTRY: Partial<Record<ShellVariant, ComponentType<ShellProps>>> = {
  "backoffice-default": BackofficeShell,
  "command-rail": CommandRailShell,
  "sidebar": SidebarShell,
};

const FALLBACK_SHELL: ComponentType<ShellProps> = BackofficeShell;

export function resolveShellComponent(variant: ShellVariant): ComponentType<ShellProps> {
  return SHELL_REGISTRY[variant] ?? FALLBACK_SHELL;
}

export default function ShellRegistry({
  variant,
  role,
  children,
}: ShellProps & { variant: ShellVariant }) {
  // Static lookup in SHELL_REGISTRY, not component creation — the resolved
  // reference is stable across renders (it's a module-level map). The lint rule's
  // heuristic can't distinguish a registry dispatch from an inline component
  // definition; this is the former, which is the intended pattern for shell variants.
  /* eslint-disable react-hooks/static-components -- static SHELL_REGISTRY lookup, not inline component creation */
  const Shell = resolveShellComponent(variant);
  return <Shell role={role}>{children}</Shell>;
  /* eslint-enable react-hooks/static-components */
}
