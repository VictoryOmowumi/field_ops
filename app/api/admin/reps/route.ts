import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { getOrgMembershipForUser, hasAllowedOrgRole } from "@/lib/auth/org-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type CreateRepPayload = {
  fullName: string;
  email: string;
  phone?: string;
  state?: string;
  lga?: string;
  targetOutlets?: number | null;
  targetConversions?: number | null;
  assignedSupervisorUserId?: string | null;
  notes?: string;
  status?: "active" | "inactive" | "suspended";
  campaignIds?: string[];
  bankName?: string;
  accountNumber?: string;
  accountName?: string;
  paymentType?: "daily_rate" | "commission" | "daily_plus_commission";
  dailyRate?: number | null;
  commissionRate?: number | null;
};

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
}

function badRequest(message: string) {
  return NextResponse.json({ success: false, message }, { status: 400 });
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["admin", "super_admin"])) return forbidden();

  const membership = await getOrgMembershipForUser(user.id);
  if (!membership || !hasAllowedOrgRole(membership.role, ["org_admin", "supervisor"])) return forbidden();

  const supabase = createServerSupabaseClient();
  let query = supabase
    .from("rep_profiles")
    .select("id, organization_id, user_id, rep_code, state, lga, target_outlets, target_conversions, assigned_supervisor_user_id, notes, status, bank_name, account_number, account_name, payment_type, daily_rate, commission_rate, created_at")
    .eq("organization_id", membership.organizationId)
    .order("created_at", { ascending: false });

  if (membership.role === "supervisor") {
    query = query.eq("assigned_supervisor_user_id", user.id);
  }

  const { data: reps, error: repsError } = await query;
  if (repsError) return NextResponse.json({ success: false, message: repsError.message }, { status: 500 });

  const { data: orgAgentUsers } = await supabase
    .from("organization_users")
    .select("user_id, status")
    .eq("organization_id", membership.organizationId)
    .eq("role", "agent");

  const orgAgentMap = new Map((orgAgentUsers ?? []).map((row) => [row.user_id, row.status ?? "active"]));
  const repByUserId = new Map((reps ?? []).map((rep) => [rep.user_id, rep]));
  const missingAgentIds: string[] = [];
  for (const agentUserId of orgAgentMap.keys()) {
    if (!repByUserId.has(agentUserId)) missingAgentIds.push(agentUserId);
  }

  let createdReps: typeof reps = [];
  if (missingAgentIds.length > 0) {
    const rows = missingAgentIds.map((agentUserId, index) => ({
      organization_id: membership.organizationId,
      user_id: agentUserId,
      rep_code: `REP-${Date.now().toString().slice(-6)}-${index}`,
      status: orgAgentMap.get(agentUserId) === "suspended" ? "inactive" : "active",
    }));
    const { data: insertedRows } = await supabase
      .from("rep_profiles")
      .insert(rows)
      .select("id, organization_id, user_id, rep_code, state, lga, target_outlets, target_conversions, assigned_supervisor_user_id, notes, status, bank_name, account_number, account_name, payment_type, daily_rate, commission_rate, created_at");
    createdReps = insertedRows ?? [];
  }

  const mergedReps = [...(reps ?? []), ...(createdReps ?? [])];

  const userIds = mergedReps.map((x) => x.user_id);
  const supervisorIds = mergedReps.map((x) => x.assigned_supervisor_user_id).filter(Boolean) as string[];
  const allUserIds = [...new Set([...userIds, ...supervisorIds])];

  const { data: profiles } = allUserIds.length
    ? await supabase.from("profiles").select("user_id, full_name, email, phone").in("user_id", allUserIds)
    : { data: [] as Array<{ user_id: string; full_name: string | null; email: string | null; phone: string | null }> };
  const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p]));

  const repUserIds = userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"];
  const { data: assignments } = await supabase
    .from("campaign_assignments")
    .select("user_id, campaign_id, campaigns(name)")
    .eq("organization_id", membership.organizationId)
    .eq("role", "agent")
    .in("user_id", repUserIds);

  const campaignByUser = new Map<string, Array<{ id: string; name: string }>>();
  for (const row of assignments ?? []) {
    const list = campaignByUser.get(row.user_id) ?? [];
    list.push({
      id: row.campaign_id,
      name: (row as { campaigns?: { name?: string } }).campaigns?.name ?? "Campaign",
    });
    campaignByUser.set(row.user_id, list);
  }

  const items = mergedReps.map((rep) => {
    const repProfile = profileMap.get(rep.user_id);
    const supervisorProfile = rep.assigned_supervisor_user_id
      ? profileMap.get(rep.assigned_supervisor_user_id)
      : null;
    return {
      id: rep.id,
      userId: rep.user_id,
      repCode: rep.rep_code,
      displayName: repProfile?.full_name ?? repProfile?.email ?? "Unnamed Rep",
      email: repProfile?.email ?? null,
      phone: repProfile?.phone ?? null,
      territory: [rep.lga, rep.state].filter(Boolean).join(", "),
      status: rep.status,
      targetOutlets: rep.target_outlets,
      targetConversions: rep.target_conversions,
      bankName: rep.bank_name,
      accountNumber: rep.account_number,
      accountName: rep.account_name,
      paymentType: rep.payment_type,
      dailyRate: rep.daily_rate,
      commissionRate: rep.commission_rate,
      supervisor: supervisorProfile?.full_name ?? null,
      campaignIds: (campaignByUser.get(rep.user_id) ?? []).map((x) => x.id),
      campaigns: campaignByUser.get(rep.user_id) ?? [],
    };
  });

  return NextResponse.json({ success: true, reps: items });
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["admin", "super_admin"])) return forbidden();

  const membership = await getOrgMembershipForUser(user.id);
  if (!membership || !hasAllowedOrgRole(membership.role, ["org_admin"])) {
    return NextResponse.json(
      { success: false, message: "Only organization admins can create reps." },
      { status: 403 }
    );
  }

  const payload = (await request.json()) as Partial<CreateRepPayload>;
  if (!payload.fullName?.trim()) return badRequest("Full name is required.");
  if (!payload.email?.trim()) return badRequest("Email is required.");

  const supabase = createServerSupabaseClient();
  const email = payload.email.trim().toLowerCase();
  const nowIso = new Date().toISOString();
  const repCode = `REP-${Date.now().toString().slice(-6)}`;
  const { data: organization } = await supabase
    .from("organizations")
    .select("slug")
    .eq("id", membership.organizationId)
    .maybeSingle();
  const orgSlug = organization?.slug?.trim();
  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/accept-invite${orgSlug ? `?org=${encodeURIComponent(orgSlug)}` : ""}`;

  const { data: invited, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { role: "agent", org_role: "agent" },
    redirectTo,
  });
  if (inviteError || !invited.user) {
    return NextResponse.json({ success: false, message: inviteError?.message ?? "Failed to invite rep." }, { status: 500 });
  }

  const invitedUserId = invited.user.id;
  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      user_id: invitedUserId,
      full_name: payload.fullName.trim(),
      email,
      phone: payload.phone?.trim() || null,
      updated_at: nowIso,
    },
    { onConflict: "user_id" }
  );
  if (profileError) return NextResponse.json({ success: false, message: profileError.message }, { status: 500 });

  const { error: memberError } = await supabase.from("organization_users").upsert(
    {
      organization_id: membership.organizationId,
      user_id: invitedUserId,
      role: "agent",
      status: "invited",
      invite_sent_at: nowIso,
      accepted_at: null,
      updated_at: nowIso,
    },
    { onConflict: "organization_id,user_id" }
  );
  if (memberError) return NextResponse.json({ success: false, message: memberError.message }, { status: 500 });

  const { data: repData, error: repError } = await supabase
    .from("rep_profiles")
    .insert({
      organization_id: membership.organizationId,
      user_id: invitedUserId,
      rep_code: repCode,
      state: payload.state?.trim() || null,
      lga: payload.lga?.trim() || null,
      target_outlets: payload.targetOutlets ?? null,
      target_conversions: payload.targetConversions ?? null,
      assigned_supervisor_user_id: payload.assignedSupervisorUserId ?? null,
      notes: payload.notes?.trim() || null,
      status: payload.status ?? "active",
      bank_name: payload.bankName?.trim() || null,
      account_number: payload.accountNumber?.trim() || null,
      account_name: payload.accountName?.trim() || null,
      payment_type: payload.paymentType ?? null,
      daily_rate: payload.dailyRate ?? null,
      commission_rate: payload.commissionRate ?? null,
    })
    .select("id, user_id")
    .single();

  if (repError || !repData) {
    return NextResponse.json({ success: false, message: repError?.message ?? "Failed to create rep profile." }, { status: 500 });
  }

  const campaignIds = [...new Set(payload.campaignIds ?? [])];
  if (campaignIds.length > 0) {
    const rows = campaignIds.map((campaignId) => ({
      organization_id: membership.organizationId,
      campaign_id: campaignId,
      user_id: invitedUserId,
      role: "agent",
      status: "active",
    }));
    const { error: assignmentError } = await supabase.from("campaign_assignments").insert(rows);
    if (assignmentError) {
      return NextResponse.json({ success: false, message: assignmentError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true, rep: { id: repData.id, userId: invitedUserId } }, { status: 201 });
}
