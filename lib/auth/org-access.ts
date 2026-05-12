import { createServerSupabaseClient } from "@/lib/supabase/server";

export type OrgRole = "org_admin" | "supervisor" | "agent";

export async function getOrgMembershipForUser(userId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("organization_users")
    .select("id, organization_id, role, status, created_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return {
    id: data.id as string,
    organizationId: data.organization_id as string,
    role: data.role as OrgRole,
    status: data.status as "active" | "inactive" | "invited" | "suspended",
  };
}

export function hasAllowedOrgRole(role: OrgRole | null, allowedRoles: OrgRole[]) {
  if (!role) return false;
  return allowedRoles.includes(role);
}
