"use client";

import { useQuery } from "@tanstack/react-query";

import { authorizedFetch } from "@/lib/api/client";
import type { CampaignWorkflowConfigV1 } from "@/types/workflow";
import type { OrgRole } from "@/lib/auth/org-access";
import {
  cacheAgentAuthContext,
  cacheAgentBootstrap,
  cacheAgentCampaignDetail,
  getCachedAgentBootstrap,
  isLikelyOfflineError,
  OfflinePreloadRequiredError,
  type OfflineAware,
} from "@/lib/offline/agent-cache";

export type AgentBootstrapCampaign = {
  id: string;
  name?: string;
  status: string;
  startDate?: string | null;
  endDate?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  state?: string | null;
  lga?: string | null;
  outletTypes?: string[];
  outlet_types?: string[];
  products?: Array<{ sku?: string; name?: string }>;
  workflowTemplate?: string;
  workflow?: CampaignWorkflowConfigV1;
  agentCopy?: CampaignWorkflowConfigV1["agentCopy"];
  validationRules?: CampaignWorkflowConfigV1["validationRules"];
};

export type AgentBootstrap = {
  profile: {
    id?: string;
    fullName?: string;
    email?: string | null;
    phone?: string | null;
    mustChangePassword?: boolean;
    organizationId?: string;
    organizationRole?: string;
  };
  assignedCampaigns: AgentBootstrapCampaign[];
  recentOutlets: Array<{
    id: string;
    name: string;
    state?: string | null;
    lga?: string | null;
    created_at: string;
  }>;
  syncState: { pending: number; failed: number };
};

export type AgentBootstrapResult = OfflineAware<AgentBootstrap>;

function toCachedCampaignDetail(campaign: AgentBootstrapCampaign) {
  return {
    ...campaign,
    name: campaign.name ?? "Campaign",
    start_date: campaign.start_date ?? campaign.startDate ?? null,
    end_date: campaign.end_date ?? campaign.endDate ?? null,
    outlet_types: campaign.outlet_types ?? campaign.outletTypes ?? [],
    stats: {
      visitsToday: 0,
      conversions: 0,
      pendingOrRevisit: 0,
    },
  };
}

function isOrgRole(value: unknown): value is OrgRole {
  return value === "org_admin" || value === "supervisor" || value === "agent";
}

export function useAgentBootstrap() {
  return useQuery({
    queryKey: ["agent-bootstrap"],
    staleTime: 60 * 1000,
    queryFn: async (): Promise<AgentBootstrapResult> => {
      try {
        const res = await authorizedFetch<{
          success: boolean;
          bootstrap?: AgentBootstrap;
          message?: string;
        }>("/api/agent/bootstrap");

        if (!res.success || !res.bootstrap) {
          throw new Error(res.message || "Unable to load agent profile.");
        }

        await cacheAgentBootstrap(res.bootstrap);

        if (res.bootstrap.profile.id) {
          await cacheAgentAuthContext({
            userId: res.bootstrap.profile.id,
            appRole: "agent",
            organizationId: res.bootstrap.profile.organizationId,
            orgRole: isOrgRole(res.bootstrap.profile.organizationRole) ? res.bootstrap.profile.organizationRole : "agent",
            membershipStatus: "active",
            organizationStatus: "active",
            validatedAt: new Date().toISOString(),
          });
        }

        await Promise.all(
          res.bootstrap.assignedCampaigns.map((campaign) => cacheAgentCampaignDetail(toCachedCampaignDetail(campaign)))
        );

        return { ...res.bootstrap, offlineStatus: "fresh" };
      } catch (error) {
        if (isLikelyOfflineError(error)) {
          const cached = await getCachedAgentBootstrap();
          if (cached) return { ...cached, offlineStatus: "cached" };
          throw new OfflinePreloadRequiredError();
        }
        throw error;
      }
    },
  });
}
