import { NextRequest, NextResponse } from "next/server";

import { getOrgMembershipForUser, hasAllowedOrgRole } from "@/lib/auth/org-access";
import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type CreateOutletPayload = {
  name: string;
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

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["admin", "super_admin"])) return forbidden();

  const membership = await getOrgMembershipForUser(user.id);
  if (!membership || !hasAllowedOrgRole(membership.role, ["org_admin", "supervisor"])) return forbidden();

  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(50, Math.max(1, Number(request.nextUrl.searchParams.get("pageSize") ?? "20") || 20));
  const search = (request.nextUrl.searchParams.get("search") ?? "").trim();
  const syncStatus = (request.nextUrl.searchParams.get("syncStatus") ?? "all").trim();
  const stateFilter = (request.nextUrl.searchParams.get("state") ?? "all").trim();

  const supabase = createServerSupabaseClient();
  let query = supabase
    .from("outlets")
    .select("id, name, outlet_type, contact_person, phone, state, lga, sync_status, campaign_id, created_by, created_at, campaigns(name)", { count: "exact" })
    .eq("organization_id", membership.organizationId)
    .order("created_at", { ascending: false });

  if (syncStatus !== "all") query = query.eq("sync_status", syncStatus);
  if (stateFilter !== "all") query = query.eq("state", stateFilter);
  if (search) {
    const escaped = search.replace(/,/g, "\\,");
    query = query.or(`name.ilike.%${escaped}%,phone.ilike.%${escaped}%,state.ilike.%${escaped}%,lga.ilike.%${escaped}%`);
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await query.range(from, to);

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

  const creatorIds = [...new Set((data ?? []).map((x) => x.created_by).filter(Boolean))] as string[];
  const { data: profiles } = creatorIds.length
    ? await supabase.from("profiles").select("user_id, full_name").in("user_id", creatorIds)
    : { data: [] as Array<{ user_id: string; full_name: string | null }> };
  const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p.full_name ?? "Unknown"]));

  const outlets = (data ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    type: item.outlet_type ?? "-",
    contact: item.contact_person ?? "-",
    phone: item.phone ?? "-",
    campaignId: item.campaign_id,
    campaign: (item as { campaigns?: { name?: string } }).campaigns?.name ?? "-",
    rep: item.created_by ? profileMap.get(item.created_by) ?? "-" : "-",
    location: [item.lga, item.state].filter(Boolean).join(", ") || "-",
    syncStatus: item.sync_status,
    createdAt: item.created_at,
  }));

  const { data: stateRows } = await supabase
    .from("outlets")
    .select("state")
    .eq("organization_id", membership.organizationId);
  const states = [...new Set((stateRows ?? []).map((item) => item.state).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b));

  return NextResponse.json({ success: true, outlets, total: count ?? 0, page, pageSize, states });
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["admin", "super_admin"])) return forbidden();

  const membership = await getOrgMembershipForUser(user.id);
  if (!membership || !hasAllowedOrgRole(membership.role, ["org_admin"])) return forbidden();

  const payload = (await request.json()) as CreateOutletPayload;
  if (!payload.name?.trim()) {
    return NextResponse.json({ success: false, message: "Outlet name is required." }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("outlets")
    .insert({
      organization_id: membership.organizationId,
      campaign_id: payload.campaignId ?? null,
      name: payload.name.trim(),
      outlet_type: payload.outletType ?? null,
      contact_person: payload.contactPerson ?? null,
      phone: payload.phone ?? null,
      address: payload.address ?? null,
      state: payload.state ?? null,
      lga: payload.lga ?? null,
      latitude: payload.latitude ?? null,
      longitude: payload.longitude ?? null,
      location_accuracy: payload.locationAccuracy ?? null,
      sync_status: payload.syncStatus ?? "synced",
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) return NextResponse.json({ success: false, message: error?.message ?? "Failed to create outlet." }, { status: 500 });
  return NextResponse.json({ success: true, outlet: data }, { status: 201 });
}
