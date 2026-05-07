import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { getOrgMembershipForUser, hasAllowedOrgRole } from "@/lib/auth/org-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
}

type RouteContext = {
  params: Promise<{ id: string }>;
};

type UpdateAssignmentsPayload = {
  supervisorUserId?: string | null;
  agentUserIds?: string[];
};

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["admin", "super_admin"])) return forbidden();

  const membership = await getOrgMembershipForUser(user.id);
  if (!membership || !hasAllowedOrgRole(membership.role, ["org_admin", "supervisor"])) return forbidden();

  const { id } = await context.params;
  const supabase = createServerSupabaseClient();

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, name, assigned_supervisor_user_id")
    .eq("id", id)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();

  if (campaignError || !campaign) {
    return NextResponse.json({ success: false, message: campaignError?.message ?? "Campaign not found." }, { status: 404 });
  }

  const { data: assignments, error: assignmentsError } = await supabase
    .from("campaign_assignments")
    .select("id, user_id, role, status")
    .eq("campaign_id", id)
    .eq("organization_id", membership.organizationId)
    .eq("status", "active");

  if (assignmentsError) {
    return NextResponse.json({ success: false, message: assignmentsError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    campaign,
    assignments: assignments ?? [],
  });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["admin", "super_admin"])) return forbidden();

  const membership = await getOrgMembershipForUser(user.id);
  if (!membership || !hasAllowedOrgRole(membership.role, ["org_admin"])) return forbidden();

  const { id } = await context.params;
  const payload = (await request.json()) as UpdateAssignmentsPayload;
  const agentUserIds = [...new Set(payload.agentUserIds ?? [])];

  const supabase = createServerSupabaseClient();

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, organization_id")
    .eq("id", id)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();

  if (campaignError || !campaign) {
    return NextResponse.json({ success: false, message: campaignError?.message ?? "Campaign not found." }, { status: 404 });
  }

  const { error: clearError } = await supabase
    .from("campaign_assignments")
    .delete()
    .eq("campaign_id", id)
    .eq("organization_id", membership.organizationId)
    .eq("role", "agent");

  if (clearError) {
    return NextResponse.json({ success: false, message: clearError.message }, { status: 500 });
  }

  if (agentUserIds.length > 0) {
    const rows = agentUserIds.map((userId) => ({
      organization_id: membership.organizationId,
      campaign_id: id,
      user_id: userId,
      role: "agent",
      status: "active",
    }));

    const { error: insertAgentsError } = await supabase.from("campaign_assignments").insert(rows);
    if (insertAgentsError) {
      return NextResponse.json({ success: false, message: insertAgentsError.message }, { status: 500 });
    }
  }

  const { error: updateCampaignError } = await supabase
    .from("campaigns")
    .update({ assigned_supervisor_user_id: payload.supervisorUserId ?? null })
    .eq("id", id)
    .eq("organization_id", membership.organizationId);

  if (updateCampaignError) {
    return NextResponse.json({ success: false, message: updateCampaignError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
