import {
  closeInfrastructureAllocation,
  createInfrastructureAllocation,
  listInfrastructureAllocationsByOrganization,
} from "@/lib/billing/repository";
import type { AllocationType } from "@/lib/billing/types";

/**
 * Opens/closes InfrastructureAllocation windows. Anchored on the organization (required);
 * campaignActivationId is an optional attribution tag, not the primary key — see
 * docs/architecture/commercial-licensing-architecture.md §3 for why this is org-first, not
 * campaign-first.
 */
export async function openAllocation(input: {
  organizationId: string;
  campaignActivationId?: string | null;
  allocationType: AllocationType;
  costAmount?: number | null;
}) {
  return createInfrastructureAllocation(input);
}

export async function closeAllocation(id: string, status: "expired" | "migrated" = "expired") {
  return closeInfrastructureAllocation(id, status);
}

export async function listAllocationsForOrganization(organizationId: string) {
  return listInfrastructureAllocationsByOrganization(organizationId);
}
