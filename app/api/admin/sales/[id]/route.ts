import { NextRequest, NextResponse } from "next/server";

import { getOrgMembershipForUser, hasAllowedOrgRole } from "@/lib/auth/org-access";
import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type UpdateSalePayload = {
  campaignId?: string | null;
  outletId?: string;
  agentId?: string | null;
  productName?: string;
  quantity?: number;
  salesValue?: number | null;
  conversionStatus?: "converted" | "pending" | "revisit";
  notes?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  locationAccuracy?: number | null;
  syncStatus?: "pending" | "synced" | "failed";
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
  if (!hasRequiredRole(user, ["admin", "super_admin"])) return forbidden();
  const membership = await getOrgMembershipForUser(user.id);
  if (!membership || !hasAllowedOrgRole(membership.role, ["org_admin", "supervisor"])) return forbidden();

  const { id } = await context.params;
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("sales")
    .select("id, campaign_id, outlet_id, agent_id, product_name, quantity, sales_value, conversion_status, notes, latitude, longitude, location_accuracy, sync_status, created_at, campaigns(name), outlets(name)")
    .eq("organization_id", membership.organizationId)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return NextResponse.json({ success: false, message: error?.message ?? "Sale not found." }, { status: 404 });
  return NextResponse.json({ success: true, sale: data });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["admin", "super_admin"])) return forbidden();
  const membership = await getOrgMembershipForUser(user.id);
  if (!membership || !hasAllowedOrgRole(membership.role, ["org_admin"])) return forbidden();

  const { id } = await context.params;
  const payload = (await request.json()) as UpdateSalePayload;
  const patch: Record<string, unknown> = {};
  if (payload.campaignId !== undefined) patch.campaign_id = payload.campaignId;
  if (payload.outletId !== undefined) patch.outlet_id = payload.outletId;
  if (payload.agentId !== undefined) patch.agent_id = payload.agentId;
  if (payload.productName !== undefined) patch.product_name = payload.productName;
  if (payload.quantity !== undefined) patch.quantity = payload.quantity;
  if (payload.salesValue !== undefined) patch.sales_value = payload.salesValue;
  if (payload.conversionStatus !== undefined) patch.conversion_status = payload.conversionStatus;
  if (payload.notes !== undefined) patch.notes = payload.notes;
  if (payload.latitude !== undefined) patch.latitude = payload.latitude;
  if (payload.longitude !== undefined) patch.longitude = payload.longitude;
  if (payload.locationAccuracy !== undefined) patch.location_accuracy = payload.locationAccuracy;
  if (payload.syncStatus !== undefined) patch.sync_status = payload.syncStatus;

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("sales")
    .update(patch)
    .eq("organization_id", membership.organizationId)
    .eq("id", id);

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

