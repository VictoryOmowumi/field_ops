import { NextRequest, NextResponse } from "next/server";

import { getOrgMembershipForUser, hasAllowedOrgRole } from "@/lib/auth/org-access";
import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string; activityId: string }>;
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

  const { id: campaignId, activityId } = await context.params;
  const supabase = createServerSupabaseClient();

  if (activityId.startsWith("visit-")) {
    const visitId = activityId.replace("visit-", "");
    const { data: visit, error } = await supabase
      .from("visits")
      .select("id, outcome, task_type, task_payload, notes, state, lga, latitude, longitude, sync_status, created_at, outlet_id, agent_id, outlets(name)")
      .eq("id", visitId)
      .eq("organization_id", membership.organizationId)
      .eq("campaign_id", campaignId)
      .maybeSingle();
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    if (!visit) return NextResponse.json({ success: false, message: "Activity not found." }, { status: 404 });

    const actorId = (visit as { agent_id?: string | null }).agent_id ?? null;
    let actorName = "-";
    if (actorId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", actorId)
        .maybeSingle();
      actorName = profile?.full_name ?? "-";
    }

    const { data: evidence } = await supabase
      .from("visit_evidence")
      .select("id, file_url, created_at")
      .eq("organization_id", membership.organizationId)
      .eq("visit_id", visitId)
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
      activity: {
        id: activityId,
        type: "visit",
        outlet: (visit as { outlets?: { name?: string } }).outlets?.name ?? "-",
        actor: actorName,
        status: visit.outcome,
        createdAt: visit.created_at,
        details: visit,
        evidence: evidenceRows.map((row) => ({
          ...row,
          signed_url: signedUrlMap.get(row.file_url) ?? null,
        })),
      },
    });
  }

  if (activityId.startsWith("sale-")) {
    const saleId = activityId.replace("sale-", "");
    const { data: sale, error } = await supabase
      .from("sales")
      .select("id, product_name, quantity, sales_value, conversion_status, notes, latitude, longitude, sync_status, created_at, outlet_id, agent_id, outlets(name)")
      .eq("id", saleId)
      .eq("organization_id", membership.organizationId)
      .eq("campaign_id", campaignId)
      .maybeSingle();
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    if (!sale) return NextResponse.json({ success: false, message: "Activity not found." }, { status: 404 });

    const actorId = (sale as { agent_id?: string | null }).agent_id ?? null;
    let actorName = "-";
    if (actorId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", actorId)
        .maybeSingle();
      actorName = profile?.full_name ?? "-";
    }

    return NextResponse.json({
      success: true,
      activity: {
        id: activityId,
        type: "sale",
        outlet: (sale as { outlets?: { name?: string } }).outlets?.name ?? "-",
        actor: actorName,
        status: sale.conversion_status,
        createdAt: sale.created_at,
        details: sale,
      },
    });
  }

  return NextResponse.json({ success: false, message: "Unsupported activity id." }, { status: 400 });
}
