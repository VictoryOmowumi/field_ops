"use client";

import { useQuery } from "@tanstack/react-query";

import { authorizedFetch } from "@/lib/api/client";

export type AgentBootstrap = {
  profile: {
    id?: string;
    fullName?: string;
    email?: string | null;
    phone?: string | null;
    organizationId?: string;
    organizationRole?: string;
  };
  assignedCampaigns: Array<{
    id: string;
    name?: string;
    status: string;
  }>;
  recentOutlets: Array<{
    id: string;
    name: string;
    state?: string | null;
    lga?: string | null;
    created_at: string;
  }>;
  syncState: { pending: number; failed: number };
};

export function useAgentBootstrap() {
  return useQuery({
    queryKey: ["agent-bootstrap"],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const res = await authorizedFetch<{
        success: boolean;
        bootstrap?: AgentBootstrap;
        message?: string;
      }>("/api/agent/bootstrap");

      if (!res.success || !res.bootstrap) {
        throw new Error(res.message || "Unable to load agent profile.");
      }

      return res.bootstrap;
    },
  });
}

