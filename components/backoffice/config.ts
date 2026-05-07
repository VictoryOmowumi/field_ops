import {
  Home01Icon,
  Store01Icon,
  User03Icon,
  Analytics02Icon,
  Search01Icon,
  Alert02Icon,
  GearsIcon,
  Megaphone01Icon,
} from "@hugeicons/core-free-icons";

import type { BackofficeRole, NavAction, UtilityAction } from "./types";

export const adminNav: NavAction[] = [
  { label: "Dashboard", href: "/admin/dashboard", icon: Home01Icon },
  { label: "Campaigns", href: "/admin/campaigns", icon: Megaphone01Icon },
  { label: "Reps", href: "/admin/reps", icon: User03Icon },
  { label: "Outlets", href: "/admin/outlets", icon: Store01Icon },
  { label: "Reports", href: "/admin/reports", icon: Analytics02Icon },
  { label: "Settings", href: "/admin/settings", icon: GearsIcon },
];

export const superAdminNav: NavAction[] = [
  { label: "Dashboard", href: "/super-admin/dashboard", icon: Home01Icon },
  { label: "Organizations", href: "/super-admin/organizations", icon: Store01Icon },
  { label: "Campaign Ops", href: "/super-admin/campaigns", icon: Megaphone01Icon },
  { label: "Users", href: "/super-admin/users", icon: User03Icon },
  { label: "Settings", href: "/super-admin/settings", icon: GearsIcon },
];

export const defaultUtilityActions: UtilityAction[] = [
  { label: "Quick Search", icon: Search01Icon },
  { label: "Alerts", icon: Alert02Icon },
];

export const superAdminGlobalUtilityActions: UtilityAction[] = [
  { label: "Organizations", href: "/super-admin/organizations", icon: Store01Icon },
  { label: "Campaign Ops", href: "/super-admin/campaigns", icon: Megaphone01Icon },
  { label: "Users", href: "/super-admin/users", icon: User03Icon },
  { label: "Settings", href: "/super-admin/settings", icon: GearsIcon },
];

export function getBackofficeNav(role: BackofficeRole) {
  return role === "super_admin" ? superAdminNav : adminNav;
}

export function getBackofficeHomeHref(role: BackofficeRole) {
  return role === "super_admin" ? "/super-admin/dashboard" : "/admin/dashboard";
}

export function getContextUtilityActions(role: BackofficeRole, pathname: string) {
  const orgRouteMatch = pathname.match(/^\/super-admin\/organizations\/([^/]+)/);
  const activeOrganizationId = orgRouteMatch?.[1];
  const isSuperAdminOrgContext = Boolean(activeOrganizationId && activeOrganizationId !== "new");

  if (isSuperAdminOrgContext) {
    return [
      {
        label: "Overview",
        href: `/super-admin/organizations/${activeOrganizationId}`,
        icon: Home01Icon,
      },
      {
        label: "Campaigns",
        href: `/super-admin/organizations/${activeOrganizationId}/campaigns`,
        icon: Megaphone01Icon,
      },
      {
        label: "Users",
        href: `/super-admin/organizations/${activeOrganizationId}/users`,
        icon: User03Icon,
      },
      {
        label: "Usage",
        href: `/super-admin/organizations/${activeOrganizationId}/usage`,
        icon: Analytics02Icon,
      },
    ] satisfies UtilityAction[];
  }

  if (role === "super_admin") return superAdminGlobalUtilityActions;

  return defaultUtilityActions;
}
