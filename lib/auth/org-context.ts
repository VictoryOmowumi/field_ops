import { createServerSupabaseClient } from "@/lib/supabase/server";

export type UserOrgMembership = {
  organizationId: string;
  role: "org_admin" | "supervisor" | "agent";
  status: "active" | "inactive" | "invited" | "suspended";
};

export async function getPrimaryOrgMembership(userId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("organization_users")
    .select("organization_id, role, status, created_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  return {
    organizationId: data.organization_id as string,
    role: data.role as UserOrgMembership["role"],
    status: data.status as UserOrgMembership["status"],
  } satisfies UserOrgMembership;
}
