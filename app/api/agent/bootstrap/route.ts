import { NextRequest, NextResponse } from "next/server";

import { getPrimaryOrgMembership } from "@/lib/auth/org-context";
import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { buildWorkflowConfigFromTemplate } from "@/lib/workflow";
import { campaignWorkflowConfigV1Schema } from "@/schemas/workflow";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["agent", "admin", "super_admin"])) return forbidden();

  const membership = await getPrimaryOrgMembership(user.id);
  if (!membership) return forbidden();

  const supabase = createServerSupabaseClient();
  const [profileRes, campaignsRes, assignmentsRes, outletsRes] = await Promise.all([
    supabase.from("profiles").select("full_name, email, phone").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("campaigns")
      .select("id, name, status, start_date, end_date, state, lga, outlet_types, products, campaign_workflow_template, campaign_workflow")
      .eq("organization_id", membership.organizationId)
      .in("status", ["active", "draft"])
      .order("created_at", { ascending: false }),
    supabase
      .from("campaign_assignments")
      .select("campaign_id, status")
      .eq("organization_id", membership.organizationId)
      .eq("user_id", user.id)
      .eq("role", "agent"),
    supabase
      .from("outlets")
      .select("id, name, state, lga, latitude, longitude, created_at")
      .eq("organization_id", membership.organizationId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const assignedCampaignIds = new Set((assignmentsRes.data ?? []).filter((x) => x.status === "active").map((x) => x.campaign_id));
  const assignedCampaigns = (campaignsRes.data ?? []).filter((campaign) => assignedCampaignIds.has(campaign.id));

  const campaigns = assignedCampaigns.map((campaign) => {
    const template = (campaign.campaign_workflow_template as
      | "outlet_registration"
      | "sales_activation"
      | "product_audit"
      | "existing_outlet_sales"
      | "full_trade_audit"
      | null) ?? "sales_activation";
    const parsed = campaignWorkflowConfigV1Schema.safeParse(campaign.campaign_workflow);
    const workflow = parsed.success ? parsed.data : buildWorkflowConfigFromTemplate(template);
    return {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      startDate: campaign.start_date,
      endDate: campaign.end_date,
      state: campaign.state,
      lga: campaign.lga,
      outletTypes: Array.isArray(campaign.outlet_types) ? campaign.outlet_types : [],
      products: Array.isArray(campaign.products) ? campaign.products : [],
      workflowTemplate: workflow.template,
      workflow,
      agentCopy: workflow.agentCopy,
      validationRules: workflow.validationRules,
    };
  });

  return NextResponse.json({
    success: true,
    bootstrap: {
      profile: {
        id: user.id,
        fullName: profileRes.data?.full_name ?? "Agent",
        email: profileRes.data?.email ?? user.email,
        phone: profileRes.data?.phone ?? null,
        organizationId: membership.organizationId,
        organizationRole: membership.role,
      },
      assignedCampaigns: campaigns,
      recentOutlets: outletsRes.data ?? [],
      syncState: {
        pending: 0,
        failed: 0,
      },
    },
  });
}
