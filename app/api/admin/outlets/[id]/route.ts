import { NextRequest, NextResponse } from "next/server";

import { getOrgMembershipForUser, hasAllowedOrgRole } from "@/lib/auth/org-access";
import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type UpdateOutletPayload = {
  name?: string;
  campaignId?: string | null;
  outletType?: string | null;
  contactPerson?: string | null;
  phone?: string | null;
  address?: string | null;
  state?: string | null;
  lga?: string | null;
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
  const { data: outlet, error } = await supabase
    .from("outlets")
    .select("id, name, campaign_id, outlet_type, contact_person, phone, address, state, lga, latitude, longitude, location_accuracy, sync_status, created_by, created_at, campaigns(name)")
    .eq("organization_id", membership.organizationId)
    .eq("id", id)
    .maybeSingle();

  if (error || !outlet) return NextResponse.json({ success: false, message: error?.message ?? "Outlet not found." }, { status: 404 });

  const [{ data: visits }, { data: sales }] = await Promise.all([
    supabase
      .from("visits")
      .select("id, campaign_id, task_type, outcome, notes, state, lga, latitude, longitude, location_accuracy, created_at, agent_id, task_payload")
      .eq("organization_id", membership.organizationId)
      .eq("outlet_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("sales")
      .select("id, visit_id, product_name, quantity, sales_value, conversion_status, created_at")
      .eq("organization_id", membership.organizationId)
      .eq("outlet_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const visitIds = (visits ?? []).map((visit) => visit.id);
  const agentIds = Array.from(new Set((visits ?? []).map((visit) => visit.agent_id).filter(Boolean)));

  const [{ data: visitEvidence }, { data: profiles }] = await Promise.all([
    visitIds.length
      ? supabase
          .from("visit_evidence")
          .select("id, visit_id, file_url, file_name, file_type, file_size, created_at")
          .eq("organization_id", membership.organizationId)
          .is("deleted_at", null)
          .in("visit_id", visitIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    agentIds.length
      ? supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", agentIds)
      : Promise.resolve({ data: [] as Array<{ user_id: string; full_name: string | null }> }),
  ]);

  const evidenceRows = (visitEvidence ?? []) as Array<{
    id: string;
    visit_id: string;
    file_url: string;
    file_name?: string | null;
    file_type?: string | null;
    file_size?: number | null;
    created_at: string;
  }>;
  const evidencePaths = evidenceRows.map((row) => row.file_url);
  const signedUrls =
    evidencePaths.length > 0
      ? await supabase.storage.from("evidence").createSignedUrls(evidencePaths, 60 * 60)
      : { data: [] as Array<{ path: string; signedUrl: string }> };

  const signedUrlMap = new Map((signedUrls.data ?? []).map((item) => [item.path, item.signedUrl]));
  const profileMap = new Map((profiles ?? []).map((profile) => [profile.user_id, profile.full_name ?? "Unknown Agent"]));

  const evidenceByVisit = new Map<string, Array<Record<string, unknown>>>();
  for (const evidence of evidenceRows) {
    const current = evidenceByVisit.get(evidence.visit_id) ?? [];
    current.push({
      ...evidence,
      signed_url: signedUrlMap.get(evidence.file_url) ?? null,
    });
    evidenceByVisit.set(evidence.visit_id, current);
  }

  const visitsWithDetails = (visits ?? []).map((visit) => ({
    ...visit,
    agent_name: profileMap.get(visit.agent_id) ?? visit.agent_id,
    evidence: evidenceByVisit.get(visit.id) ?? [],
    sales: (sales ?? []).filter((sale) => sale.visit_id === visit.id),
  }));

  return NextResponse.json({
    success: true,
    outlet: {
      ...outlet,
      visits: visitsWithDetails,
      sales,
    },
  });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["admin", "super_admin"])) return forbidden();
  const membership = await getOrgMembershipForUser(user.id);
  if (!membership || !hasAllowedOrgRole(membership.role, ["org_admin"])) return forbidden();

  const { id } = await context.params;
  const payload = (await request.json()) as UpdateOutletPayload;
  const patch: Record<string, unknown> = {};
  if (payload.name !== undefined) patch.name = payload.name;
  if (payload.campaignId !== undefined) patch.campaign_id = payload.campaignId;
  if (payload.outletType !== undefined) patch.outlet_type = payload.outletType;
  if (payload.contactPerson !== undefined) patch.contact_person = payload.contactPerson;
  if (payload.phone !== undefined) patch.phone = payload.phone;
  if (payload.address !== undefined) patch.address = payload.address;
  if (payload.state !== undefined) patch.state = payload.state;
  if (payload.lga !== undefined) patch.lga = payload.lga;
  if (payload.latitude !== undefined) patch.latitude = payload.latitude;
  if (payload.longitude !== undefined) patch.longitude = payload.longitude;
  if (payload.locationAccuracy !== undefined) patch.location_accuracy = payload.locationAccuracy;
  if (payload.syncStatus !== undefined) patch.sync_status = payload.syncStatus;

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("outlets")
    .update(patch)
    .eq("organization_id", membership.organizationId)
    .eq("id", id);

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
