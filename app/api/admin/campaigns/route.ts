import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { getOrgMembershipForUser, hasAllowedOrgRole } from "@/lib/auth/org-access";
import { buildWorkflowConfigFromTemplate } from "@/lib/workflow";
import { campaignWorkflowConfigV1Schema, workflowTemplateSchema } from "@/schemas/workflow";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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
  assignedSupervisorUserId?: string | null;
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

  const { data, error } = await supabase
    .from("campaigns")
    .select("id, organization_id, name, campaign_type, description, start_date, end_date, status, state, lga, target_outlets, target_conversions, expected_reps, outlet_types, products, form_requirements, runtime_form_config, campaign_tasks, campaign_workflow_template, campaign_workflow, assigned_supervisor_user_id, launched_at, created_at")
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

  const [visitsRes, salesRes, assignmentsRes] = await Promise.all([
    supabase
      .from("visits")
      .select("campaign_id, outcome, created_at")
      .eq("organization_id", organizationId)
      .in("campaign_id", campaignIds),
    supabase
      .from("sales")
      .select("campaign_id, created_at")
      .eq("organization_id", organizationId)
      .in("campaign_id", campaignIds),
    supabase
      .from("campaign_assignments")
      .select("campaign_id, role, status")
      .eq("organization_id", organizationId)
      .in("campaign_id", campaignIds),
  ]);

  const visitsByCampaign = new Map<string, { visits: number; conversions: number; lastVisitAt: string | null }>();
  for (const visit of visitsRes.data ?? []) {
    const key = visit.campaign_id ?? "";
    if (!key) continue;
    const current = visitsByCampaign.get(key) ?? { visits: 0, conversions: 0, lastVisitAt: null };
    current.visits += 1;
    if (visit.outcome === "converted") current.conversions += 1;
    if (!current.lastVisitAt || new Date(visit.created_at).getTime() > new Date(current.lastVisitAt).getTime()) {
      current.lastVisitAt = visit.created_at;
    }
    visitsByCampaign.set(key, current);
  }

  const lastSaleByCampaign = new Map<string, string>();
  for (const sale of salesRes.data ?? []) {
    const key = sale.campaign_id ?? "";
    if (!key) continue;
    const current = lastSaleByCampaign.get(key);
    if (!current || new Date(sale.created_at).getTime() > new Date(current).getTime()) {
      lastSaleByCampaign.set(key, sale.created_at);
    }
  }

  const assignedAgentsByCampaign = new Map<string, number>();
  for (const assignment of assignmentsRes.data ?? []) {
    if (assignment.role !== "agent") continue;
    if (assignment.status && assignment.status !== "active") continue;
    const key = assignment.campaign_id ?? "";
    if (!key) continue;
    assignedAgentsByCampaign.set(key, (assignedAgentsByCampaign.get(key) ?? 0) + 1);
  }

  const enrichedCampaigns = campaigns.map((campaign) => {
    const visitMetrics = visitsByCampaign.get(campaign.id) ?? { visits: 0, conversions: 0, lastVisitAt: null };
    const lastSaleAt = lastSaleByCampaign.get(campaign.id) ?? null;
    const lastActivityAt =
      visitMetrics.lastVisitAt && lastSaleAt
        ? new Date(visitMetrics.lastVisitAt).getTime() > new Date(lastSaleAt).getTime()
          ? visitMetrics.lastVisitAt
          : lastSaleAt
        : visitMetrics.lastVisitAt ?? lastSaleAt;
    const conversionRate = visitMetrics.visits > 0 ? (visitMetrics.conversions / visitMetrics.visits) * 100 : 0;

    return {
      ...campaign,
      assigned_reps_count: assignedAgentsByCampaign.get(campaign.id) ?? 0,
      visits_count: visitMetrics.visits,
      conversions_count: visitMetrics.conversions,
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
      assigned_supervisor_user_id: payload.assignedSupervisorUserId ?? null,
      status: payload.status || "draft",
      launched_at: payload.status === "active" ? new Date().toISOString() : null,
    })
    .select("id, organization_id, name, campaign_type, description, start_date, end_date, status, state, lga, target_outlets, target_conversions, expected_reps, outlet_types, products, form_requirements, runtime_form_config, campaign_tasks, campaign_workflow_template, campaign_workflow, assigned_supervisor_user_id, launched_at, created_at")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to create campaign." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, campaign: data }, { status: 201 });
}
