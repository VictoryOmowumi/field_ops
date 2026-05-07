import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { getPrimaryOrgMembership } from "@/lib/auth/org-context";
import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type SalePayload = {
  id?: string;
  idempotencyKey?: string;
  productId: string;
  productName?: string;
  quantity: number;
  price?: number;
  notes?: string;
  gps?: { latitude?: number; longitude?: number; locationAccuracy?: number };
  syncStatus?: "pending" | "synced" | "failed";
};

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}
function forbidden() {
  return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["agent", "admin", "super_admin"])) return forbidden();
  const membership = await getPrimaryOrgMembership(user.id);
  if (!membership) return forbidden();

  const { id: visitId } = await context.params;
  const payload = (await request.json()) as SalePayload;
  const supabase = createServerSupabaseClient();

  const { data: visit, error: visitError } = await supabase
    .from("visits")
    .select("id, organization_id, campaign_id, outlet_id, agent_id")
    .eq("id", visitId)
    .eq("organization_id", membership.organizationId)
    .eq("agent_id", user.id)
    .maybeSingle();
  if (visitError || !visit) return forbidden();

  const saleId = payload.id || (payload.idempotencyKey ? `sale-${payload.idempotencyKey}` : randomUUID());
  const { data: existingSale } = await supabase
    .from("sales")
    .select("id")
    .eq("id", saleId)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();
  if (existingSale) {
    return NextResponse.json({ success: true, sale: existingSale, duplicate: true }, { status: 200 });
  }
  const { data: sale, error: saleError } = await supabase
    .from("sales")
    .insert({
      id: saleId,
      organization_id: membership.organizationId,
      campaign_id: visit.campaign_id,
      outlet_id: visit.outlet_id,
      visit_id: visit.id,
      agent_id: user.id,
      product_name: payload.productName ?? payload.productId,
      quantity: payload.quantity,
      sales_value: payload.price ?? null,
      conversion_status: "converted",
      notes: payload.notes ?? null,
      latitude: payload.gps?.latitude ?? null,
      longitude: payload.gps?.longitude ?? null,
      location_accuracy: payload.gps?.locationAccuracy ?? null,
      sync_status: payload.syncStatus ?? "synced",
    })
    .select("id")
    .single();

  if (saleError || !sale) {
    return NextResponse.json({ success: false, message: saleError?.message ?? "Failed to save sale." }, { status: 500 });
  }

  await supabase
    .from("visits")
    .update({ outcome: "converted", visit_outcome_code: "products_sold", visit_outcome_label: "Products sold" })
    .eq("id", visit.id)
    .eq("organization_id", membership.organizationId);
  return NextResponse.json({ success: true, sale }, { status: 201 });
}
