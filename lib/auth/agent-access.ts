import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function isAgentAssignedToCampaign(
  organizationId: string,
  campaignId: string,
  userId: string
) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("campaign_assignments")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("campaign_id", campaignId)
    .eq("user_id", userId)
    .eq("role", "agent")
    .eq("status", "active")
    .maybeSingle();

  if (error) return false;
  return Boolean(data?.id);
}

