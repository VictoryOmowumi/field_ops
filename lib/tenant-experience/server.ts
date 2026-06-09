import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveTenantExperienceConfig } from "@/lib/tenant-experience/resolve";
import type { TenantExperienceConfig } from "@/lib/tenant-experience/types";

export async function getTenantExperienceConfigByOrganizationId(
  organizationId: string
): Promise<TenantExperienceConfig> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("experience_config")
    .eq("id", organizationId)
    .maybeSingle();
  if (error || !data) return resolveTenantExperienceConfig(null);
  return resolveTenantExperienceConfig(data.experience_config);
}

export async function getTenantExperienceConfigBySlug(
  slug: string
): Promise<TenantExperienceConfig> {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return resolveTenantExperienceConfig(null);
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("experience_config")
    .eq("slug", normalized)
    .maybeSingle();
  if (error || !data) return resolveTenantExperienceConfig(null);
  return resolveTenantExperienceConfig(data.experience_config);
}
