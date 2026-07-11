import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { getOrgMembershipForUser, hasAllowedOrgRole } from "@/lib/auth/org-access";
import { buildWorkflowConfigFromTemplate } from "@/lib/workflow";
import { campaignWorkflowConfigV1Schema, workflowTemplateSchema } from "@/schemas/workflow";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ensurePendingActivation } from "@/lib/billing/activation-service";

type CreateCampaignPayload = {
  name: string;
  campaignType?: string;
  state?: string;
  lga?: string;
  targetOutlets?: number;
  targetConversions?: number;
  expectedReps?: number;
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
  description?: string;
  startDate?: string;
  endDate?: string;
  status?: "draft" | "active" | "completed";
  campaignWorkflowTemplate?: string;
  campaignWorkflow?: Record<string, unknown>;
};

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
}

function badRequest(message: string) {
  return NextResponse.json({ success: false, message }, { status: 400 });
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["admin", "super_admin"])) return forbidden();

  const supabase = createServerSupabaseClient();

  let organizationId: string | null = null;
  if (user.role !== "super_admin") {
    const membership = await getOrgMembershipForUser(user.id);
    if (!membership || !hasAllowedOrgRole(membership.role, ["org_admin", "supervisor"])) return forbidden();
    organizationId = membership.organizationId;
  } else {
    organizationId = request.nextUrl.searchParams.get("organizationId");
    if (!organizationId) return badRequest("organizationId query parameter is required for super_admin.");
  }
  const isLite = request.nextUrl.searchParams.get("lite") === "1";

  if (isLite) {
    const { data, error } = await supabase
      .from("campaigns")
      .select("id, name, status, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });
    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, campaigns: data ?? [] });
  }

  const { data, error } = await supabase
    .from("campaigns")
    .select("id, organization_id, name, campaign_type, description, start_date, end_date, status, state, lga, target_outlets, target_conversions, expected_reps, outlet_types, products, form_requirements, runtime_form_config, campaign_tasks, campaign_workflow_template, campaign_workflow, launched_at, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  const campaigns = data ?? [];
  const campaignIds = campaigns.map((campaign) => campaign.id);

  if (campaignIds.length === 0) {
    return NextResponse.json({ success: true, campaigns: [] });
  }

  const [metricsRes, assignmentsRes] = await Promise.all([
    supabase.rpc("campaign_visit_metrics", {
      p_organization_id: organizationId,
      p_campaign_ids: campaignIds,
    }),
    supabase
      .from("campaign_assignments")
      .select("campaign_id, user_id, role, status")
      .eq("organization_id", organizationId)
      .in("campaign_id", campaignIds),
  ]);

  if (metricsRes.error) {
    return NextResponse.json({ success: false, message: metricsRes.error.message }, { status: 500 });
  }

  type CampaignMetricsRow = {
    campaign_id: string;
    visits_count: number;
    achieved_visits: number;
    conversions: number;
    last_visit_at: string | null;
    last_sale_at: string | null;
  };
  const metricsByCampaign = new Map(
    ((metricsRes.data ?? []) as CampaignMetricsRow[]).map((row) => [row.campaign_id, row])
  );

  const assignedAgentsByCampaign = new Map<string, number>();
  const supervisorIdsByCampaign = new Map<string, string[]>();
  for (const assignment of assignmentsRes.data ?? []) {
    if (assignment.status && assignment.status !== "active") continue;
    const key = assignment.campaign_id ?? "";
    if (!key) continue;
    if (assignment.role === "agent") {
      assignedAgentsByCampaign.set(key, (assignedAgentsByCampaign.get(key) ?? 0) + 1);
      continue;
    }
    if (assignment.role === "supervisor") {
      const existing = supervisorIdsByCampaign.get(key) ?? [];
      supervisorIdsByCampaign.set(key, [...existing, assignment.user_id]);
    }
  }

  const enrichedCampaigns = campaigns.map((campaign) => {
    const metrics = metricsByCampaign.get(campaign.id);
    const achievedVisits = metrics?.achieved_visits ?? 0;
    const conversions = metrics?.conversions ?? 0;
    const lastVisitAt = metrics?.last_visit_at ?? null;
    const lastSaleAt = metrics?.last_sale_at ?? null;
    const lastActivityAt =
      lastVisitAt && lastSaleAt
        ? new Date(lastVisitAt).getTime() > new Date(lastSaleAt).getTime()
          ? lastVisitAt
          : lastSaleAt
        : lastVisitAt ?? lastSaleAt;
    const conversionRate = achievedVisits > 0 ? (conversions / achievedVisits) * 100 : 0;

    return {
      ...campaign,
      assigned_reps_count: assignedAgentsByCampaign.get(campaign.id) ?? 0,
      supervisor_user_ids: supervisorIdsByCampaign.get(campaign.id) ?? [],
      supervisor_count: (supervisorIdsByCampaign.get(campaign.id) ?? []).length,
      visits_count: metrics?.visits_count ?? 0,
      conversions_count: conversions,
      achieved_visits: achievedVisits,
      conversion_rate: conversionRate,
      last_activity_at: lastActivityAt,
    };
  });

  return NextResponse.json({ success: true, campaigns: enrichedCampaigns });
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["admin", "super_admin"])) return forbidden();

  const payload = (await request.json()) as Partial<CreateCampaignPayload>;
  if (!payload.name?.trim()) return badRequest("Campaign name is required.");
  if (payload.startDate && payload.endDate && payload.endDate < payload.startDate) {
    return badRequest("End date can't be before the start date.");
  }

  const membership = await getOrgMembershipForUser(user.id);
  if (!membership || !hasAllowedOrgRole(membership.role, ["org_admin"])) return forbidden();
  const workflowTemplate = workflowTemplateSchema.safeParse(payload.campaignWorkflowTemplate ?? "sales_activation");
  if (!workflowTemplate.success) return badRequest("Invalid campaign workflow template.");
  const workflowInput = payload.campaignWorkflow
    ? campaignWorkflowConfigV1Schema.safeParse(payload.campaignWorkflow)
    : null;
  if (payload.campaignWorkflow && !workflowInput?.success) return badRequest("Invalid campaign workflow config.");
  const workflow = workflowInput?.success
    ? workflowInput.data
    : buildWorkflowConfigFromTemplate(workflowTemplate.data);

  const supabase = createServerSupabaseClient();
  const supervisorUserIds = [...new Set(payload.assignedSupervisorUserIds ?? [])];
  if (supervisorUserIds.length > 0) {
    const { data: validSupervisors, error: supervisorValidationError } = await supabase
      .from("organization_users")
      .select("user_id, role")
      .eq("organization_id", membership.organizationId)
      .in("user_id", supervisorUserIds)
      .in("role", ["supervisor", "org_admin"]);

    if (supervisorValidationError) {
      return NextResponse.json({ success: false, message: supervisorValidationError.message }, { status: 500 });
    }
    const validIds = new Set((validSupervisors ?? []).map((row) => row.user_id));
    const invalidIds = supervisorUserIds.filter((userId) => !validIds.has(userId));
    if (invalidIds.length > 0) {
      return NextResponse.json({ success: false, message: "One or more supervisors are invalid for this organization." }, { status: 400 });
    }
  }
  const { data, error } = await supabase
    .from("campaigns")
    .insert({
      organization_id: membership.organizationId,
      name: payload.name.trim(),
      campaign_type: payload.campaignType?.trim() || null,
      description: payload.description?.trim() || null,
      start_date: payload.startDate || null,
      end_date: payload.endDate || null,
      state: payload.state?.trim() || null,
      lga: payload.lga?.trim() || null,
      target_outlets: payload.targetOutlets ?? null,
      target_conversions: payload.targetConversions ?? null,
      expected_reps: payload.expectedReps ?? null,
      outlet_types: payload.outletTypes ?? [],
      products: payload.products ?? [],
      form_requirements: payload.formRequirements ?? {},
      runtime_form_config: payload.runtimeFormConfig ?? {},
      campaign_tasks: payload.campaignTasks ?? ["register_outlet", "sell_to_outlet"],
      campaign_workflow_template: workflowTemplate.data,
      campaign_workflow: workflow,
      // Every new campaign starts as Draft, full stop — this is not optional and does not read
      // payload.status. The Phase 5 commercial activation gate only runs on the Draft -> Active
      // transition in PATCH /api/admin/campaigns/[id]; a caller-supplied status here would create
      // a campaign already Active without ever passing through that check. Activation always
      // happens as a separate, later, gated step.
      status: "draft",
      launched_at: null,
    })
    .select("id, organization_id, name, campaign_type, description, start_date, end_date, status, state, lga, target_outlets, target_conversions, expected_reps, outlet_types, products, form_requirements, runtime_form_config, campaign_tasks, campaign_workflow_template, campaign_workflow, launched_at, created_at")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to create campaign." },
      { status: 500 }
    );
  }

  // Every campaign gets a commercial activation record (pending_approval) the moment it exists,
  // so the Super Admin approval queue is populated live rather than only from the Phase 1
  // backfill of historical campaigns. This does NOT gate activation — that's Phase 5.
  try {
    await ensurePendingActivation({ campaignId: data.id, organizationId: membership.organizationId });
  } catch (activationError) {
    await supabase.from("campaigns").delete().eq("id", data.id).eq("organization_id", membership.organizationId);
    return NextResponse.json(
      {
        success: false,
        message:
          activationError instanceof Error ? activationError.message : "Failed to create campaign activation record.",
      },
      { status: 500 }
    );
  }

  if (supervisorUserIds.length > 0) {
    const supervisorRows = supervisorUserIds.map((userId) => ({
      organization_id: membership.organizationId,
      campaign_id: data.id,
      user_id: userId,
      role: "supervisor",
      status: "active",
    }));
    const { error: insertSupervisorError } = await supabase.from("campaign_assignments").insert(supervisorRows);
    if (insertSupervisorError) {
      return NextResponse.json({ success: false, message: insertSupervisorError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true, campaign: { ...data, supervisor_user_ids: supervisorUserIds } }, { status: 201 });
}
