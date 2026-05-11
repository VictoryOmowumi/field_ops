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

  const { data: assignments } = await supabase
    .from("campaign_assignments")
    .select("campaign_id, campaigns(name)")
    .eq("organization_id", membership.organizationId)
    .eq("role", "agent")
    .eq("user_id", rep.user_id);

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
      status: rep.status,
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
