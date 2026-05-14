import { NextRequest, NextResponse } from "next/server";

import { getPrimaryOrgMembership } from "@/lib/auth/org-context";
import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}
function forbidden() {
  return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
}

function normalizeOutcomeLabel(
  outcome: string | null | undefined,
  outcomeLabel: string | null | undefined,
  outcomeCode: string | null | undefined
) {
  const raw = (outcomeLabel ?? "").trim().toLowerCase();
  if (raw === "follow-up needed" || raw === "follow up needed" || outcomeCode === "follow_up_needed") {
    return "No sale recorded";
  }
  if (outcome === "pending") return "Pending sync";
  if (outcome === "no_sale") return "No sale recorded";
  return outcomeLabel ?? null;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["agent", "admin", "super_admin"])) return forbidden();
  const membership = await getPrimaryOrgMembership(user.id);
  if (!membership) return forbidden();

  const { id } = await context.params;
  const supabase = createServerSupabaseClient();

  const { data: visit, error } = await supabase
    .from("visits")
    .select("id, campaign_id, outlet_id, task_type, outcome, visit_outcome_code, visit_outcome_label, notes, task_payload, state, lga, latitude, longitude, sync_status, created_at, outlets(name, contact_person, phone, address, state, lga), campaigns(name)")
    .eq("id", id)
    .eq("organization_id", membership.organizationId)
    .eq("agent_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  if (!visit) return NextResponse.json({ success: false, message: "Submission not found." }, { status: 404 });

  const { data: evidence } = await supabase
    .from("visit_evidence")
    .select("id, file_url, created_at")
    .eq("organization_id", membership.organizationId)
    .eq("visit_id", id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  const evidenceRows = evidence ?? [];
  const evidencePaths = evidenceRows.map((row) => row.file_url);
  const signed =
    evidencePaths.length > 0
      ? await supabase.storage.from("evidence").createSignedUrls(evidencePaths, 60 * 60)
      : { data: [] as Array<{ path: string; signedUrl: string }> };
  const signedUrlMap = new Map((signed.data ?? []).map((row) => [row.path, row.signedUrl]));

  return NextResponse.json({
    success: true,
    submission: {
      id: visit.id,
      campaignId: visit.campaign_id,
      outletId: visit.outlet_id,
      taskType: visit.task_type,
      outcome: visit.outcome,
      outcomeCode: visit.visit_outcome_code,
      outcomeLabel: normalizeOutcomeLabel(visit.outcome, visit.visit_outcome_label, visit.visit_outcome_code),
      notes: visit.notes,
      payload: visit.task_payload,
      state: visit.state,
      lga: visit.lga,
      latitude: visit.latitude,
      longitude: visit.longitude,
      syncStatus: visit.sync_status,
      createdAt: visit.created_at,
      outlet: (visit as { outlets?: { name?: string } }).outlets?.name ?? "-",
      outletContactPerson: (visit as { outlets?: { contact_person?: string | null } }).outlets?.contact_person ?? null,
      outletPhone: (visit as { outlets?: { phone?: string | null } }).outlets?.phone ?? null,
      outletAddress: (visit as { outlets?: { address?: string | null } }).outlets?.address ?? null,
      outletState: (visit as { outlets?: { state?: string | null } }).outlets?.state ?? null,
      outletLga: (visit as { outlets?: { lga?: string | null } }).outlets?.lga ?? null,
      campaign: (visit as { campaigns?: { name?: string } }).campaigns?.name ?? "-",
      evidence: evidenceRows.map((row) => ({
        ...row,
        signed_url: signedUrlMap.get(row.file_url) ?? null,
      })),
    },
  });
}
