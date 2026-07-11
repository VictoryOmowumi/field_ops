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
  supervisorUserIds?: string[];
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
    .select("id, name")
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
  const supervisorUserIds = [...new Set(payload.supervisorUserIds ?? [])];

  const supabase = createServerSupabaseClient();

  // Validate everything up front, in parallel, before any writes — so an invalid
  // supervisor ID can never leave agent assignments partially overwritten.
  const [
    { data: campaign, error: campaignError },
    { data: validSupervisors, error: supervisorValidationError },
  ] = await Promise.all([
    supabase
      .from("campaigns")
      .select("id, organization_id")
      .eq("id", id)
      .eq("organization_id", membership.organizationId)
      .maybeSingle(),
    supabase
      .from("organization_users")
      .select("user_id, role")
      .eq("organization_id", membership.organizationId)
      .in("user_id", supervisorUserIds.length ? supervisorUserIds : ["00000000-0000-0000-0000-000000000000"])
      .in("role", ["supervisor", "org_admin"]),
  ]);

  if (campaignError || !campaign) {
    return NextResponse.json({ success: false, message: campaignError?.message ?? "Campaign not found." }, { status: 404 });
  }
  if (supervisorValidationError) {
    return NextResponse.json({ success: false, message: supervisorValidationError.message }, { status: 500 });
  }

  const validSupervisorIds = new Set((validSupervisors ?? []).map((row) => row.user_id));
  const invalidIds = supervisorUserIds.filter((userId) => !validSupervisorIds.has(userId));
  if (invalidIds.length > 0) {
    return NextResponse.json(
      { success: false, message: "One or more supervisors are invalid for this organization." },
      { status: 400 }
    );
  }

  const [{ error: clearAgentsError }, { error: clearSupervisorsError }] = await Promise.all([
    supabase
      .from("campaign_assignments")
      .delete()
      .eq("campaign_id", id)
      .eq("organization_id", membership.organizationId)
      .eq("role", "agent"),
    supabase
      .from("campaign_assignments")
      .delete()
      .eq("campaign_id", id)
      .eq("organization_id", membership.organizationId)
      .eq("role", "supervisor"),
  ]);

  if (clearAgentsError) {
    return NextResponse.json({ success: false, message: clearAgentsError.message }, { status: 500 });
  }
  if (clearSupervisorsError) {
    return NextResponse.json({ success: false, message: clearSupervisorsError.message }, { status: 500 });
  }

  // PromiseLike, not Promise — Supabase's query builder is thenable (awaitable, works fine with
  // Promise.all) but doesn't implement the full Promise interface (.catch/.finally), which is
  // what Promise<T>[] structurally requires.
  const insertOps: PromiseLike<{ error: { message: string } | null }>[] = [];
  if (agentUserIds.length > 0) {
    insertOps.push(
      supabase.from("campaign_assignments").insert(
        agentUserIds.map((userId) => ({
          organization_id: membership.organizationId,
          campaign_id: id,
          user_id: userId,
          role: "agent",
          status: "active",
        }))
      )
    );
  }
  if (supervisorUserIds.length > 0) {
    insertOps.push(
      supabase.from("campaign_assignments").insert(
        supervisorUserIds.map((userId) => ({
          organization_id: membership.organizationId,
          campaign_id: id,
          user_id: userId,
          role: "supervisor",
          status: "active",
        }))
      )
    );
  }

  const insertResults = await Promise.all(insertOps);
  const insertError = insertResults.find((result) => result.error)?.error;
  if (insertError) {
    return NextResponse.json({ success: false, message: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
