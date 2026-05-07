export const APP_ROLES = ["agent", "admin", "super_admin"] as const;

export type AppRole = (typeof APP_ROLES)[number];

type MetadataUser = {
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
};

function normalizeRole(value: unknown): AppRole | null {
  if (value === "agent" || value === "admin" || value === "super_admin") {
    return value;
  }
  return null;
}

export function extractAppRole(user: MetadataUser): AppRole | null {
  return normalizeRole(user.app_metadata?.role) ?? normalizeRole(user.user_metadata?.role);
}

export function getDefaultRouteForRole(role: AppRole) {
  if (role === "agent") return "/agent/home";
  if (role === "admin") return "/admin/dashboard";
  return "/super-admin/dashboard";
}

