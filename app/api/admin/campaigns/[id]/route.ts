import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { getOrgMembershipForUser, hasAllowedOrgRole } from "@/lib/auth/org-access";
import { buildWorkflowConfigFromTemplate } from "@/lib/workflow";
import { computeAndStoreCampaignAnalyticsSnapshot, getCampaignAnalyticsSnapshot, getCampaignAnalyticsSummary } from "@/lib/campaign/intelligence";
import { campaignWorkflowConfigV1Schema, workflowTemplateSchema } from "@/schemas/workflow";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { evaluateActivationGate } from "@/lib/billing/activation-gate";
import { storageProvider } from "@/lib/storage";
import { captureException } from "@/lib/observability/sentry";

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

  // A completed/archived campaign's numbers are final — read the frozen snapshot instead of
  // re-running the live RPCs on every page load. Draft/active campaigns are still changing, so
  // they keep computing live.
  const summary =
    data.status === "completed" || data.status === "archived"
      ? await getCampaignAnalyticsSnapshot(supabase, data.organization_id, data.id)
      : await getCampaignAnalyticsSummary(supabase, data.organization_id, data.id);
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
  status?: "draft" | "active" | "completed" | "archived" | "cancelled";
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

  // Phase 8: archived campaigns are read-only. Reject the whole request rather than trying to
  // figure out which individual fields are "safe" to still allow through.
  const { data: campaignBeforePatch } = await supabase
    .from("campaigns")
    .select("status, start_date, end_date")
    .eq("id", id)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();
  if (campaignBeforePatch?.status === "archived") {
    return NextResponse.json(
      { success: false, code: "campaign_archived", message: "This campaign is archived and read-only." },
      { status: 409 }
    );
  }

  const patch: Record<string, unknown> = {};
  if (payload.name !== undefined) patch.name = payload.name?.trim();
  if (payload.campaignType !== undefined) patch.campaign_type = payload.campaignType?.trim() || null;
  if (payload.description !== undefined) patch.description = payload.description?.trim() || null;
  if (payload.startDate !== undefined) patch.start_date = payload.startDate || null;
  if (payload.endDate !== undefined) patch.end_date = payload.endDate || null;

  const effectiveStartDate = (payload.startDate !== undefined ? payload.startDate : campaignBeforePatch?.start_date) ?? null;
  const effectiveEndDate = (payload.endDate !== undefined ? payload.endDate : campaignBeforePatch?.end_date) ?? null;
  if (effectiveStartDate && effectiveEndDate && effectiveEndDate < effectiveStartDate) {
    return NextResponse.json({ success: false, message: "End date can't be before the start date." }, { status: 400 });
  }

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

  // Phase 8: completed_at drives the retention countdown and the archival scheduler — it has to
  // be stamped at the moment of transition, not derived later from updated_at (which changes on
  // any edit, not just this one).
  if (patch.status === "completed" && campaignBeforePatch?.status !== "completed") {
    patch.completed_at = new Date().toISOString();
  }

  // Phase 5: Commercial Activation Gate — only the Draft/Completed -> Active transition is
  // gated. Re-saving a campaign that's already active (no-op on status) never re-triggers this.
  if (patch.status === "active") {
    const { data: currentCampaign } = await supabase
      .from("campaigns")
      .select("status")
      .eq("id", id)
      .eq("organization_id", membership.organizationId)
      .maybeSingle();

    if (currentCampaign && currentCampaign.status !== "active") {
      const gate = await evaluateActivationGate({
        organizationId: membership.organizationId,
        campaignId: id,
        actorUserId: user.id,
      });
      if (gate.blocked) {
        return NextResponse.json(
          {
            success: false,
            code: "commercial_activation_blocked",
            message: "This campaign can't be activated until commercial approval requirements are met.",
            reason: gate.reason,
            blockingInvoiceIds: gate.blockingInvoiceIds,
          },
          { status: 409 }
        );
      }
    }
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

  // A completed campaign's numbers are final — freeze them into a snapshot now rather than
  // re-running the expensive live RPCs on every future read. Backgrounded and non-fatal: if this
  // fails (or times out on a very large campaign), the PATCH still succeeds, and the next read
  // of this campaign's analytics lazily computes and stores the snapshot itself.
  if (patch.status === "completed" && campaignBeforePatch?.status !== "completed") {
    void computeAndStoreCampaignAnalyticsSnapshot(supabase, membership.organizationId, id).catch((snapshotError) => {
      captureException(snapshotError, {
        organizationId: membership.organizationId,
        route: "/api/admin/campaigns/[id] (snapshot on completion)",
      });
    });
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

export async function DELETE(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["admin", "super_admin"])) return forbidden();

  const membership = await getOrgMembershipForUser(user.id);
  if (!membership || !hasAllowedOrgRole(membership.role, ["org_admin"])) return forbidden();

  const { id } = await context.params;
  const supabase = createServerSupabaseClient();

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, organization_id, status")
    .eq("id", id)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();
  if (campaignError || !campaign) {
    return NextResponse.json({ success: false, message: campaignError?.message ?? "Campaign not found." }, { status: 404 });
  }
  if (campaign.status === "archived") {
    return NextResponse.json(
      { success: false, code: "campaign_archived", message: "This campaign is archived and read-only — it can't be deleted from here." },
      { status: 409 }
    );
  }

  const { data: visits, error: visitsError } = await supabase
    .from("visits")
    .select("id")
    .eq("organization_id", membership.organizationId)
    .eq("campaign_id", id);
  if (visitsError) return NextResponse.json({ success: false, message: visitsError.message }, { status: 500 });

  const visitIds = [...new Set((visits ?? []).map((row) => row.id).filter(Boolean))];
  if (visitIds.length > 0) {
    const { data: evidenceRows, error: evidenceError } = await supabase
      .from("visit_evidence")
      .select("file_url, storage_provider")
      .eq("organization_id", membership.organizationId)
      .in("visit_id", visitIds);
    if (evidenceError) return NextResponse.json({ success: false, message: evidenceError.message }, { status: 500 });

    const evidenceRefs = (evidenceRows ?? [])
      .filter((row) => Boolean(row.file_url))
      .map((row) => ({ file_url: row.file_url, storage_provider: row.storage_provider === "r2" ? "r2" as const : "supabase" as const }));
    if (evidenceRefs.length > 0) {
      const result = await storageProvider.deleteEvidenceFiles(evidenceRefs);
      if (result.warning) {
        console.warn(`Campaign delete storage cleanup warning: ${result.warning}`);
      }
    }

    const { error: deleteEvidenceError } = await supabase
      .from("visit_evidence")
      .delete()
      .eq("organization_id", membership.organizationId)
      .in("visit_id", visitIds);
    if (deleteEvidenceError) return NextResponse.json({ success: false, message: deleteEvidenceError.message }, { status: 500 });

    const { error: deleteVisitSalesError } = await supabase
      .from("sales")
      .delete()
      .eq("organization_id", membership.organizationId)
      .in("visit_id", visitIds);
    if (deleteVisitSalesError) return NextResponse.json({ success: false, message: deleteVisitSalesError.message }, { status: 500 });
  }

  const { error: deleteCampaignSalesError } = await supabase
    .from("sales")
    .delete()
    .eq("organization_id", membership.organizationId)
    .eq("campaign_id", id);
  if (deleteCampaignSalesError) return NextResponse.json({ success: false, message: deleteCampaignSalesError.message }, { status: 500 });

  const { error: deleteVisitsError } = await supabase
    .from("visits")
    .delete()
    .eq("organization_id", membership.organizationId)
    .eq("campaign_id", id);
  if (deleteVisitsError) return NextResponse.json({ success: false, message: deleteVisitsError.message }, { status: 500 });

  const { error: deleteOutletsError } = await supabase
    .from("outlets")
    .delete()
    .eq("organization_id", membership.organizationId)
    .eq("campaign_id", id);
  if (deleteOutletsError) return NextResponse.json({ success: false, message: deleteOutletsError.message }, { status: 500 });

  const { data: shareLinks } = await supabase
    .from("campaign_share_links")
    .select("id")
    .eq("organization_id", membership.organizationId)
    .eq("campaign_id", id);
  const shareLinkIds = [...new Set((shareLinks ?? []).map((row) => row.id).filter(Boolean))];
  if (shareLinkIds.length > 0) {
    const { error: deleteShareViewsError } = await supabase
      .from("campaign_share_views")
      .delete()
      .in("share_link_id", shareLinkIds);
    if (deleteShareViewsError) return NextResponse.json({ success: false, message: deleteShareViewsError.message }, { status: 500 });
  }

  const { error: deleteShareLinksError } = await supabase
    .from("campaign_share_links")
    .delete()
    .eq("organization_id", membership.organizationId)
    .eq("campaign_id", id);
  if (deleteShareLinksError) return NextResponse.json({ success: false, message: deleteShareLinksError.message }, { status: 500 });

  const { error: deleteAssignmentsError } = await supabase
    .from("campaign_assignments")
    .delete()
    .eq("organization_id", membership.organizationId)
    .eq("campaign_id", id);
  if (deleteAssignmentsError) return NextResponse.json({ success: false, message: deleteAssignmentsError.message }, { status: 500 });

  const { error: deleteCampaignError } = await supabase
    .from("campaigns")
    .delete()
    .eq("organization_id", membership.organizationId)
    .eq("id", id);
  if (deleteCampaignError) return NextResponse.json({ success: false, message: deleteCampaignError.message }, { status: 500 });

  return NextResponse.json({ success: true });
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
