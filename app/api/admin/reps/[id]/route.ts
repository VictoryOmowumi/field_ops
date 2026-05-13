import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { getOrgMembershipForUser, hasAllowedOrgRole } from "@/lib/auth/org-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type UpdateRepPayload = {
  fullName?: string;
  email?: string;
  phone?: string;
  state?: string | null;
  lga?: string | null;
  targetOutlets?: number | null;
  targetConversions?: number | null;
  assignedSupervisorUserId?: string | null;
  notes?: string | null;
  status?: "active" | "inactive";
  campaignIds?: string[];
  bankName?: string | null;
  accountNumber?: string | null;
  accountName?: string | null;
  paymentType?: "daily_rate" | "commission" | "daily_plus_commission" | null;
  dailyRate?: number | null;
  commissionRate?: number | null;
};

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
  if (!hasRequiredRole(user, ["admin", "super_admin"])) return forbidden();
  const membership = await getOrgMembershipForUser(user.id);
  if (!membership || !hasAllowedOrgRole(membership.role, ["org_admin", "supervisor"])) return forbidden();

  const { id } = await context.params;
  const supabase = createServerSupabaseClient();
  const { data: rep, error: repError } = await supabase
    .from("rep_profiles")
    .select("id, organization_id, user_id, rep_code, state, lga, target_outlets, target_conversions, assigned_supervisor_user_id, notes, status, bank_name, account_number, account_name, payment_type, daily_rate, commission_rate, created_at")
    .eq("id", id)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();

  if (repError || !rep) return NextResponse.json({ success: false, message: repError?.message ?? "Rep not found." }, { status: 404 });
  if (membership.role === "supervisor" && rep.assigned_supervisor_user_id !== user.id) return forbidden();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, phone")
    .eq("user_id", rep.user_id)
    .maybeSingle();

  const [{ data: orgMembership }, { data: authUserData }] = await Promise.all([
    supabase
      .from("organization_users")
      .select("status")
      .eq("organization_id", membership.organizationId)
      .eq("user_id", rep.user_id)
      .maybeSingle(),
    supabase.auth.admin.getUserById(rep.user_id),
  ]);

  const { data: assignments } = await supabase
    .from("campaign_assignments")
    .select("campaign_id, campaigns(name)")
    .eq("organization_id", membership.organizationId)
    .eq("role", "agent")
    .eq("user_id", rep.user_id);

  const [{ data: visits }, { data: sales }] = await Promise.all([
    supabase
      .from("visits")
      .select("id, created_at, campaign_id, outlet_id, task_type, outcome")
      .eq("organization_id", membership.organizationId)
      .eq("agent_id", rep.user_id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("sales")
      .select("id, created_at, campaign_id, outlet_id, quantity, sales_value, conversion_status")
      .eq("organization_id", membership.organizationId)
      .eq("agent_id", rep.user_id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const outletIds = [
    ...new Set([...(visits ?? []).map((item) => item.outlet_id), ...(sales ?? []).map((item) => item.outlet_id)].filter(Boolean)),
  ] as string[];
  const campaignIds = [
    ...new Set([...(visits ?? []).map((item) => item.campaign_id), ...(sales ?? []).map((item) => item.campaign_id)].filter(Boolean)),
  ] as string[];
  const [{ data: outlets }, { data: campaigns }] = await Promise.all([
    outletIds.length
      ? supabase.from("outlets").select("id, name").in("id", outletIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    campaignIds.length
      ? supabase.from("campaigns").select("id, name").in("id", campaignIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
  ]);
  const outletMap = new Map((outlets ?? []).map((item) => [item.id, item.name]));
  const campaignMap = new Map((campaigns ?? []).map((item) => [item.id, item.name]));

  const timeline = [
    ...(visits ?? []).map((item) => ({
      id: `visit-${item.id}`,
      type: "visit" as const,
      activityId: `visit-${item.id}`,
      campaignId: item.campaign_id ?? null,
      createdAt: item.created_at,
      campaign: item.campaign_id ? campaignMap.get(item.campaign_id) ?? "-" : "-",
      outlet: item.outlet_id ? outletMap.get(item.outlet_id) ?? "-" : "-",
      status: item.outcome ?? "pending",
      meta: item.task_type?.replaceAll("_", " ") ?? "visit",
    })),
    ...(sales ?? []).map((item) => ({
      id: `sale-${item.id}`,
      type: "sale" as const,
      activityId: `sale-${item.id}`,
      campaignId: item.campaign_id ?? null,
      createdAt: item.created_at,
      campaign: item.campaign_id ? campaignMap.get(item.campaign_id) ?? "-" : "-",
      outlet: item.outlet_id ? outletMap.get(item.outlet_id) ?? "-" : "-",
      status: item.conversion_status ?? "pending",
      meta: `qty ${item.quantity ?? 0}${item.sales_value ? ` · NGN ${item.sales_value}` : ""}`,
    })),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 100);

  const lastVisitAt = (visits ?? [])[0]?.created_at ?? null;
  const lastSaleAt = (sales ?? [])[0]?.created_at ?? null;
  const lastActivityAt =
    lastVisitAt && lastSaleAt
      ? new Date(lastVisitAt).getTime() > new Date(lastSaleAt).getTime()
        ? lastVisitAt
        : lastSaleAt
      : lastVisitAt ?? lastSaleAt;

  return NextResponse.json({
    success: true,
    rep: {
      id: rep.id,
      userId: rep.user_id,
      repCode: rep.rep_code,
      fullName: profile?.full_name ?? "",
      email: profile?.email ?? "",
      phone: profile?.phone ?? "",
      state: rep.state,
      lga: rep.lga,
      targetOutlets: rep.target_outlets,
      targetConversions: rep.target_conversions,
      assignedSupervisorUserId: rep.assigned_supervisor_user_id,
      notes: rep.notes,
      status: orgMembership?.status ?? rep.status,
      lastSignInAt: authUserData.user?.last_sign_in_at ?? null,
      lastActivityAt,
      bankName: rep.bank_name,
      accountNumber: rep.account_number,
      accountName: rep.account_name,
      paymentType: rep.payment_type,
      dailyRate: rep.daily_rate,
      commissionRate: rep.commission_rate,
      campaignIds: (assignments ?? []).map((x) => x.campaign_id),
      campaigns: (assignments ?? []).map((x) => ({
        id: x.campaign_id,
        name: (x as { campaigns?: { name?: string } }).campaigns?.name ?? "Campaign",
      })),
      timeline,
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
  const payload = (await request.json()) as UpdateRepPayload;
  const supabase = createServerSupabaseClient();

  const { data: rep, error: repError } = await supabase
    .from("rep_profiles")
    .select("id, user_id")
    .eq("id", id)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();

  if (repError || !rep) return NextResponse.json({ success: false, message: repError?.message ?? "Rep not found." }, { status: 404 });

  const patch: Record<string, unknown> = {};
  if (payload.state !== undefined) patch.state = payload.state;
  if (payload.lga !== undefined) patch.lga = payload.lga;
  if (payload.targetOutlets !== undefined) patch.target_outlets = payload.targetOutlets;
  if (payload.targetConversions !== undefined) patch.target_conversions = payload.targetConversions;
  if (payload.assignedSupervisorUserId !== undefined) patch.assigned_supervisor_user_id = payload.assignedSupervisorUserId;
  if (payload.notes !== undefined) patch.notes = payload.notes;
  if (payload.status !== undefined) patch.status = payload.status;
  if (payload.bankName !== undefined) patch.bank_name = payload.bankName;
  if (payload.accountNumber !== undefined) patch.account_number = payload.accountNumber;
  if (payload.accountName !== undefined) patch.account_name = payload.accountName;
  if (payload.paymentType !== undefined) patch.payment_type = payload.paymentType;
  if (payload.dailyRate !== undefined) patch.daily_rate = payload.dailyRate;
  if (payload.commissionRate !== undefined) patch.commission_rate = payload.commissionRate;

  if (Object.keys(patch).length > 0) {
    const { error: updateRepError } = await supabase
      .from("rep_profiles")
      .update(patch)
      .eq("id", id)
      .eq("organization_id", membership.organizationId);
    if (updateRepError) return NextResponse.json({ success: false, message: updateRepError.message }, { status: 500 });
  }

  if (payload.status !== undefined) {
    const { error: membershipUpdateError } = await supabase
      .from("organization_users")
      .update({ status: payload.status })
      .eq("organization_id", membership.organizationId)
      .eq("user_id", rep.user_id);
    if (membershipUpdateError) {
      return NextResponse.json({ success: false, message: membershipUpdateError.message }, { status: 500 });
    }
  }

  if (payload.fullName !== undefined || payload.email !== undefined || payload.phone !== undefined) {
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        full_name: payload.fullName,
        email: payload.email,
        phone: payload.phone,
      })
      .eq("user_id", rep.user_id);
    if (profileError) return NextResponse.json({ success: false, message: profileError.message }, { status: 500 });
  }

  if (payload.campaignIds) {
    const uniqueCampaignIds = [...new Set(payload.campaignIds)];
    const { error: clearError } = await supabase
      .from("campaign_assignments")
      .delete()
      .eq("organization_id", membership.organizationId)
      .eq("user_id", rep.user_id)
      .eq("role", "agent");
    if (clearError) return NextResponse.json({ success: false, message: clearError.message }, { status: 500 });

    if (uniqueCampaignIds.length > 0) {
      const rows = uniqueCampaignIds.map((campaignId) => ({
        organization_id: membership.organizationId,
        campaign_id: campaignId,
        user_id: rep.user_id,
        role: "agent",
        status: "active",
      }));
      const { error: insertError } = await supabase.from("campaign_assignments").insert(rows);
      if (insertError) return NextResponse.json({ success: false, message: insertError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
