import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { getOrgMembershipForUser, hasAllowedOrgRole } from "@/lib/auth/org-access";
import { buildWorkflowConfigFromTemplate } from "@/lib/workflow";
import { getCampaignAnalyticsSummary } from "@/lib/campaign/intelligence";
import { campaignWorkflowConfigV1Schema, workflowTemplateSchema } from "@/schemas/workflow";
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

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["admin", "super_admin"])) return forbidden();

  const membership = await getOrgMembershipForUser(user.id);
  if (!membership || !hasAllowedOrgRole(membership.role, ["org_admin", "supervisor"])) return forbidden();

  const { id } = await context.params;
  const supabase = createServerSupabaseClient();
  const organizationId = user.role === "super_admin"
    ? request.nextUrl.searchParams.get("organizationId")
    : membership.organizationId;

  const baseQuery = supabase
    .from("campaigns")
    .select("id, organization_id, name, campaign_type, description, start_date, end_date, status, state, lga, target_outlets, target_conversions, expected_reps, outlet_types, products, form_requirements, runtime_form_config, campaign_tasks, campaign_workflow_template, campaign_workflow, launched_at, created_at")
    .eq("id", id);

  const query = organizationId ? baseQuery.eq("organization_id", organizationId) : baseQuery;
  const { data, error } = await query.limit(1).maybeSingle();

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ success: false, message: "Campaign not found." }, { status: 404 });
  }

  const { data: supervisorAssignments } = await supabase
    .from("campaign_assignments")
    .select("user_id")
    .eq("campaign_id", id)
    .eq("organization_id", data.organization_id)
    .eq("role", "supervisor")
    .eq("status", "active");

  const summary = await getCampaignAnalyticsSummary(supabase, data.organization_id, data.id);
  return NextResponse.json({
    success: true,
    campaign: { ...data, supervisor_user_ids: (supervisorAssignments ?? []).map((item) => item.user_id) },
    summary,
  });
}

type UpdateCampaignPayload = {
  name?: string;
  campaignType?: string | null;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  status?: "draft" | "active" | "completed";
  state?: string | null;
  lga?: string | null;
  targetOutlets?: number | null;
  targetConversions?: number | null;
  expectedReps?: number | null;
  outletTypes?: string[];
  products?: Array<{ sku?: string; name?: string; price?: number | null }>;
  formRequirements?: Record<string, boolean>;
  runtimeFormConfig?: Record<string, unknown>;
  campaignTasks?: Array<
    | "register_outlet"
    | "revisit_outlet"
    | "sell_to_outlet"
    | "product_survey"
    | "availability_survey"
    | "price_survey"
  >;
  assignedSupervisorUserIds?: string[];
  action?: "launch";
  campaignWorkflowTemplate?: string;
  campaignWorkflow?: Record<string, unknown>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["admin", "super_admin"])) return forbidden();

  const membership = await getOrgMembershipForUser(user.id);
  if (!membership || !hasAllowedOrgRole(membership.role, ["org_admin"])) return forbidden();

  const { id } = await context.params;
  const payload = (await request.json()) as UpdateCampaignPayload;
  const supabase = createServerSupabaseClient();

  const patch: Record<string, unknown> = {};
  if (payload.name !== undefined) patch.name = payload.name?.trim();
  if (payload.campaignType !== undefined) patch.campaign_type = payload.campaignType?.trim() || null;
  if (payload.description !== undefined) patch.description = payload.description?.trim() || null;
  if (payload.startDate !== undefined) patch.start_date = payload.startDate || null;
  if (payload.endDate !== undefined) patch.end_date = payload.endDate || null;
  if (payload.state !== undefined) patch.state = payload.state?.trim() || null;
  if (payload.lga !== undefined) patch.lga = payload.lga?.trim() || null;
  if (payload.targetOutlets !== undefined) patch.target_outlets = payload.targetOutlets;
  if (payload.targetConversions !== undefined) patch.target_conversions = payload.targetConversions;
  if (payload.expectedReps !== undefined) patch.expected_reps = payload.expectedReps;
  if (payload.outletTypes !== undefined) patch.outlet_types = payload.outletTypes;
  if (payload.products !== undefined) patch.products = payload.products;
  if (payload.formRequirements !== undefined) patch.form_requirements = payload.formRequirements;
  if (payload.runtimeFormConfig !== undefined) patch.runtime_form_config = payload.runtimeFormConfig;
  if (payload.campaignTasks !== undefined) patch.campaign_tasks = payload.campaignTasks;
  if (payload.campaignWorkflowTemplate !== undefined) {
    const parsedTemplate = workflowTemplateSchema.safeParse(payload.campaignWorkflowTemplate);
    if (!parsedTemplate.success) {
      return NextResponse.json({ success: false, message: "Invalid campaign workflow template." }, { status: 400 });
    }
    patch.campaign_workflow_template = parsedTemplate.data;
    if (payload.campaignWorkflow === undefined) {
      patch.campaign_workflow = buildWorkflowConfigFromTemplate(parsedTemplate.data);
    }
  }
  if (payload.campaignWorkflow !== undefined) {
    const parsedWorkflow = campaignWorkflowConfigV1Schema.safeParse(payload.campaignWorkflow);
    if (!parsedWorkflow.success) {
      return NextResponse.json({ success: false, message: "Invalid campaign workflow config." }, { status: 400 });
    }
    patch.campaign_workflow = parsedWorkflow.data;
  }
  if (
    payload.formRequirements !== undefined &&
    payload.campaignWorkflow === undefined &&
    payload.campaignWorkflowTemplate === undefined
  ) {
    const { data: existing } = await supabase
      .from("campaigns")
      .select("campaign_workflow")
      .eq("id", id)
      .eq("organization_id", membership.organizationId)
      .maybeSingle();
    const parsedExisting = campaignWorkflowConfigV1Schema.safeParse(existing?.campaign_workflow);
    if (parsedExisting.success) {
      patch.campaign_workflow = withPosmActivity(parsedExisting.data, {
        enabled: Boolean(payload.formRequirements.requirePosmDeployment),
        requireQuantity: Boolean(payload.formRequirements.requirePosmQuantityWhenDeployed),
      });
    }
  }
  if (payload.status !== undefined) patch.status = payload.status;

  if (payload.action === "launch") {
    patch.status = "active";
    patch.launched_at = new Date().toISOString();
  } else if (payload.status === "active") {
    patch.launched_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("campaigns")
    .update(patch)
    .eq("id", id)
    .eq("organization_id", membership.organizationId)
    .select("id, organization_id, name, campaign_type, description, start_date, end_date, status, state, lga, target_outlets, target_conversions, expected_reps, outlet_types, products, form_requirements, runtime_form_config, campaign_tasks, campaign_workflow_template, campaign_workflow, launched_at, created_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ success: false, message: error?.message ?? "Failed to update campaign." }, { status: 500 });
  }

  if (payload.assignedSupervisorUserIds !== undefined) {
    const supervisorUserIds = [...new Set(payload.assignedSupervisorUserIds)];
    const { data: validSupervisors, error: supervisorValidationError } = await supabase
      .from("organization_users")
      .select("user_id, role")
      .eq("organization_id", membership.organizationId)
      .in("user_id", supervisorUserIds.length ? supervisorUserIds : ["00000000-0000-0000-0000-000000000000"])
      .in("role", ["supervisor", "org_admin"]);
    if (supervisorValidationError) {
      return NextResponse.json({ success: false, message: supervisorValidationError.message }, { status: 500 });
    }
    const validIds = new Set((validSupervisors ?? []).map((row) => row.user_id));
    const invalidIds = supervisorUserIds.filter((userId) => !validIds.has(userId));
    if (invalidIds.length > 0) {
      return NextResponse.json({ success: false, message: "One or more supervisors are invalid for this organization." }, { status: 400 });
    }

    const { error: clearSupervisorsError } = await supabase
      .from("campaign_assignments")
      .delete()
      .eq("campaign_id", id)
      .eq("organization_id", membership.organizationId)
      .eq("role", "supervisor");
    if (clearSupervisorsError) {
      return NextResponse.json({ success: false, message: clearSupervisorsError.message }, { status: 500 });
    }

    if (supervisorUserIds.length > 0) {
      const supervisorRows = supervisorUserIds.map((userId) => ({
        organization_id: membership.organizationId,
        campaign_id: id,
        user_id: userId,
        role: "supervisor",
        status: "active",
      }));
      const { error: insertSupervisorError } = await supabase.from("campaign_assignments").insert(supervisorRows);
      if (insertSupervisorError) {
        return NextResponse.json({ success: false, message: insertSupervisorError.message }, { status: 500 });
      }
    }
  }

  const { data: supervisorAssignments } = await supabase
    .from("campaign_assignments")
    .select("user_id")
    .eq("campaign_id", id)
    .eq("organization_id", membership.organizationId)
    .eq("role", "supervisor")
    .eq("status", "active");
  return NextResponse.json({
    success: true,
    campaign: { ...data, supervisor_user_ids: (supervisorAssignments ?? []).map((item) => item.user_id) },
  });
}

function withPosmActivity(
  workflow: ReturnType<typeof campaignWorkflowConfigV1Schema.parse>,
  options: { enabled: boolean; requireQuantity: boolean }
) {
  const hasPosm = workflow.activities.some((item) => item.id === "posm_deployment");
  if (options.enabled && !hasPosm) {
    workflow.activities.push({
      id: "posm_deployment",
      required: true,
      settings: { requireQuantityWhenDeployed: options.requireQuantity },
    });
  }
  if (!options.enabled && hasPosm) {
    workflow.activities = workflow.activities.filter((item) => item.id !== "posm_deployment");
  }
  if (options.enabled && hasPosm) {
    workflow.activities = workflow.activities.map((item) =>
      item.id === "posm_deployment"
        ? { ...item, settings: { ...(item.settings ?? {}), requireQuantityWhenDeployed: options.requireQuantity } }
        : item
    );
  }
  return workflow;
}
