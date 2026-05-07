import { NextRequest, NextResponse } from "next/server";

import { getOrgMembershipForUser, hasAllowedOrgRole } from "@/lib/auth/org-access";
import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type CreateSalePayload = {
  campaignId?: string | null;
  outletId: string;
  agentId?: string | null;
  productName: string;
  quantity: number;
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

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["admin", "super_admin"])) return forbidden();
  const membership = await getOrgMembershipForUser(user.id);
  if (!membership || !hasAllowedOrgRole(membership.role, ["org_admin", "supervisor"])) return forbidden();

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("sales")
    .select("id, product_name, quantity, sales_value, conversion_status, sync_status, created_at, campaign_id, outlet_id, agent_id, campaigns(name), outlets(name)")
    .eq("organization_id", membership.organizationId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

  const agentIds = [...new Set((data ?? []).map((x) => x.agent_id).filter(Boolean))] as string[];
  const { data: profiles } = agentIds.length
    ? await supabase.from("profiles").select("user_id, full_name").in("user_id", agentIds)
    : { data: [] as Array<{ user_id: string; full_name: string | null }> };
  const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p.full_name ?? "Unknown"]));

  const sales = (data ?? []).map((item) => ({
    id: item.id,
    product: item.product_name,
    outlet: (item as { outlets?: { name?: string } }).outlets?.name ?? "-",
    rep: item.agent_id ? profileMap.get(item.agent_id) ?? "-" : "-",
    campaign: (item as { campaigns?: { name?: string } }).campaigns?.name ?? "-",
    quantity: item.quantity,
    value: item.sales_value,
    status: item.conversion_status,
    syncStatus: item.sync_status,
    time: item.created_at,
  }));

  return NextResponse.json({ success: true, sales });
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["admin", "super_admin"])) return forbidden();
  const membership = await getOrgMembershipForUser(user.id);
  if (!membership || !hasAllowedOrgRole(membership.role, ["org_admin"])) return forbidden();

  const payload = (await request.json()) as CreateSalePayload;
  if (!payload.outletId || !payload.productName?.trim()) {
    return NextResponse.json({ success: false, message: "Outlet and product are required." }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("sales")
    .insert({
      organization_id: membership.organizationId,
      campaign_id: payload.campaignId ?? null,
      outlet_id: payload.outletId,
      agent_id: payload.agentId ?? null,
      product_name: payload.productName.trim(),
      quantity: payload.quantity,
      sales_value: payload.salesValue ?? null,
      conversion_status: payload.conversionStatus ?? "pending",
      notes: payload.notes ?? null,
      latitude: payload.latitude ?? null,
      longitude: payload.longitude ?? null,
      location_accuracy: payload.locationAccuracy ?? null,
      sync_status: payload.syncStatus ?? "synced",
    })
    .select("id")
    .single();

  if (error || !data) return NextResponse.json({ success: false, message: error?.message ?? "Failed to create sale." }, { status: 500 });
  return NextResponse.json({ success: true, sale: data }, { status: 201 });
}

