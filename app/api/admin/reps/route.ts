import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { getOrgMembershipForUser, hasAllowedOrgRole } from "@/lib/auth/org-access";
import { normalizePhoneToE164 } from "@/lib/auth/phone";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildTenantBaseUrl } from "@/lib/tenant/url";

type CreateRepPayload = {
  fullName: string;
  email?: string;
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

type OrgMembershipStatus = "active" | "inactive" | "invited" | "suspended";

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

  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(50, Math.max(1, Number(request.nextUrl.searchParams.get("pageSize") ?? "20") || 20));
  const search = (request.nextUrl.searchParams.get("search") ?? "").trim().toLowerCase();
  const statusFilter = (request.nextUrl.searchParams.get("status") ?? "all").trim();
  const stateFilter = (request.nextUrl.searchParams.get("state") ?? "all").trim();

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

  const orgAgentMap = new Map((orgAgentUsers ?? []).map((row) => [row.user_id, (row.status ?? "active") as OrgMembershipStatus]));
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

  const [{ data: visitsByRep }, { data: salesByRep }] = await Promise.all([
    supabase
      .from("visits")
      .select("agent_id, created_at")
      .eq("organization_id", membership.organizationId)
      .in("agent_id", repUserIds),
    supabase
      .from("sales")
      .select("agent_id, created_at")
      .eq("organization_id", membership.organizationId)
      .in("agent_id", repUserIds),
  ]);

  const lastActivityMap = new Map<string, string>();
  for (const row of visitsByRep ?? []) {
    const current = lastActivityMap.get(row.agent_id);
    if (!current || new Date(row.created_at).getTime() > new Date(current).getTime()) {
      lastActivityMap.set(row.agent_id, row.created_at);
    }
  }
  for (const row of salesByRep ?? []) {
    const current = lastActivityMap.get(row.agent_id);
    if (!current || new Date(row.created_at).getTime() > new Date(current).getTime()) {
      lastActivityMap.set(row.agent_id, row.created_at);
    }
  }

  const campaignByUser = new Map<string, Array<{ id: string; name: string }>>();
  for (const row of assignments ?? []) {
    const list = campaignByUser.get(row.user_id) ?? [];
    list.push({
      id: row.campaign_id,
      name: (row as { campaigns?: { name?: string } }).campaigns?.name ?? "Campaign",
    });
    campaignByUser.set(row.user_id, list);
  }

  const allItems = mergedReps.map((rep) => {
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
      state: rep.state ?? null,
      territory: [rep.lga, rep.state].filter(Boolean).join(", "),
      status: orgAgentMap.get(rep.user_id) ?? rep.status,
      targetOutlets: rep.target_outlets,
      targetConversions: rep.target_conversions,
      bankName: rep.bank_name,
      accountNumber: rep.account_number,
      accountName: rep.account_name,
      paymentType: rep.payment_type,
      dailyRate: rep.daily_rate,
      commissionRate: rep.commission_rate,
      supervisor: supervisorProfile?.full_name ?? null,
      lastSignInAt: null as string | null,
      lastActivityAt: lastActivityMap.get(rep.user_id) ?? null,
      campaignIds: (campaignByUser.get(rep.user_id) ?? []).map((x) => x.id),
      campaigns: campaignByUser.get(rep.user_id) ?? [],
    };
  });

  const states = [...new Set(allItems.map((item) => item.state).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b));

  const filteredItems = allItems.filter((item) => {
    if (statusFilter !== "all" && item.status !== statusFilter) return false;
    if (stateFilter !== "all" && item.state !== stateFilter) return false;
    if (search) {
      const haystack = [item.displayName, item.email, item.phone, item.repCode, item.territory]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  const total = filteredItems.length;
  const from = (page - 1) * pageSize;
  const pageItems = filteredItems.slice(from, from + pageSize);

  await Promise.all(
    pageItems.map(async (item) => {
      const { data: authUserData } = await supabase.auth.admin.getUserById(item.userId);
      item.lastSignInAt = authUserData.user?.last_sign_in_at ?? null;
    })
  );

  return NextResponse.json({ success: true, reps: pageItems, total, page, pageSize, states });
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
  if (!payload.email?.trim() && !payload.phone?.trim()) return badRequest("Provide at least an email or a phone number.");

  let normalizedPhone: string | null = null;
  if (payload.phone?.trim()) {
    normalizedPhone = normalizePhoneToE164(payload.phone.trim());
    if (!normalizedPhone) return badRequest("Enter a valid phone number.");
  }

  const supabase = createServerSupabaseClient();
  const email = payload.email?.trim().toLowerCase() || null;
  const fullName = payload.fullName.trim();
  const nowIso = new Date().toISOString();
  const repCode = `REP-${Date.now().toString().slice(-6)}`;

  let invitedUserId: string;
  let memberStatus: "invited" | "active" = "active";
  let acceptedAt: string | null = nowIso;
  let inviteSentAt: string | null = null;

  if (email) {
    const { data: organization } = await supabase
      .from("organizations")
      .select("slug, subdomain")
      .eq("id", membership.organizationId)
      .maybeSingle();
    const orgSlug = organization?.slug?.trim();
    const baseUrl = buildTenantBaseUrl(organization?.subdomain, process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");
    const redirectTo = `${baseUrl}/accept-invite${orgSlug ? `?org=${encodeURIComponent(orgSlug)}` : ""}`;

    const { data: invited, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: { role: "agent", org_role: "agent" },
      redirectTo,
    });
    if (inviteError || !invited.user) {
      return NextResponse.json({ success: false, message: inviteError?.message ?? "Failed to invite rep." }, { status: 500 });
    }
    invitedUserId = invited.user.id;
    memberStatus = "invited";
    acceptedAt = null;
    inviteSentAt = nowIso;

    if (normalizedPhone) {
      const { error: phoneLinkError } = await supabase.auth.admin.updateUserById(invitedUserId, {
        phone: normalizedPhone,
        phone_confirm: true,
      });
      if (phoneLinkError) {
        return NextResponse.json({ success: false, message: `Failed to link phone number: ${phoneLinkError.message}` }, { status: 500 });
      }
    }
  } else {
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      phone: normalizedPhone!,
      phone_confirm: true,
      app_metadata: { role: "agent" },
      user_metadata: { full_name: fullName, role: "agent" },
    });
    if (createError || !created.user) {
      return NextResponse.json({ success: false, message: createError?.message ?? "Failed to create rep." }, { status: 500 });
    }
    invitedUserId = created.user.id;
  }

  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      user_id: invitedUserId,
      full_name: fullName,
      email,
      phone: normalizedPhone,
      auth_method: email ? "email" : "phone",
      phone_verified_at: normalizedPhone ? nowIso : null,
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
      status: memberStatus,
      invite_sent_at: inviteSentAt,
      accepted_at: acceptedAt,
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
