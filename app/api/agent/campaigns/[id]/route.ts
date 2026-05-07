import { NextRequest, NextResponse } from "next/server";

import { isAgentAssignedToCampaign } from "@/lib/auth/agent-access";
import { getPrimaryOrgMembership } from "@/lib/auth/org-context";
import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { buildWorkflowConfigFromTemplate, deriveGuidedSteps } from "@/lib/workflow";
import { campaignWorkflowConfigV1Schema } from "@/schemas/workflow";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
}

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["agent", "admin", "super_admin"])) return forbidden();
  const membership = await getPrimaryOrgMembership(user.id);
  if (!membership) return forbidden();
  const { id } = await context.params;

  const assigned = await isAgentAssignedToCampaign(membership.organizationId, id, user.id);
  if (!assigned) return forbidden();

  const supabase = createServerSupabaseClient();
  const [campaignRes, visitStatsRes] = await Promise.all([
    supabase
      .from("campaigns")
      .select("id, name, description, status, start_date, end_date, state, lga, products, outlet_types, campaign_workflow_template, campaign_workflow")
      .eq("organization_id", membership.organizationId)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("visits")
      .select("id, outcome, created_at")
      .eq("organization_id", membership.organizationId)
      .eq("campaign_id", id)
      .eq("agent_id", user.id),
  ]);

  if (!campaignRes.data) return NextResponse.json({ success: false, message: "Campaign not found." }, { status: 404 });

  const fallbackTemplate = (campaignRes.data.campaign_workflow_template as
    | "outlet_registration"
    | "sales_activation"
    | "product_audit"
    | "existing_outlet_sales"
    | "full_trade_audit"
    | null) ?? "sales_activation";

  const parsed = campaignWorkflowConfigV1Schema.safeParse(campaignRes.data.campaign_workflow);
  const workflow = parsed.success ? parsed.data : buildWorkflowConfigFromTemplate(fallbackTemplate);
  const stepSequence = deriveGuidedSteps(workflow);

  const outcomes = visitStatsRes.data ?? [];
  return NextResponse.json({
    success: true,
    campaign: {
      ...campaignRes.data,
      workflowTemplate: workflow.template,
      workflow,
      agentCopy: workflow.agentCopy,
      validationRules: workflow.validationRules,
      stepSequence,
      stats: {
        visitsToday: outcomes.filter((x) => {
          const d = new Date(x.created_at);
          const now = new Date();
          return d.toDateString() === now.toDateString();
        }).length,
        conversions: outcomes.filter((x) => x.outcome === "converted").length,
        pendingOrRevisit: outcomes.filter((x) => x.outcome === "pending" || x.outcome === "revisit").length,
      },
    },
  });
}
