import { createHash, randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { isAgentAssignedToCampaign } from "@/lib/auth/agent-access";
import { getPrimaryOrgMembership } from "@/lib/auth/org-context";
import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { mapWorkflowOutcomeToVisitOutcome } from "@/lib/workflow";
import { campaignWorkflowConfigV1Schema, workflowSubmissionSchema } from "@/schemas/workflow";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
}

function uuidFromIdempotencyKey(key: string) {
  const hex = createHash("sha1").update(key).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["agent", "admin", "super_admin"])) return forbidden();
  const membership = await getPrimaryOrgMembership(user.id);
  if (!membership) return forbidden();

  const body = await request.json();
  const parsedPayload = workflowSubmissionSchema.safeParse(body);
  if (!parsedPayload.success) {
    return NextResponse.json({ success: false, message: "Invalid visit submission payload." }, { status: 400 });
  }

  const payload = parsedPayload.data;
  const idempotencyKey = payload.idempotencyKey ?? payload.clientSubmissionMeta?.idempotencyKey;
  const dedupeVisitId =
    typeof idempotencyKey === "string" && idempotencyKey.length > 0 ? uuidFromIdempotencyKey(idempotencyKey) : randomUUID();
  const assigned = await isAgentAssignedToCampaign(membership.organizationId, payload.campaignId, user.id);
  if (!assigned) return forbidden();

  const supabase = createServerSupabaseClient();
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, state, campaign_workflow")
    .eq("organization_id", membership.organizationId)
    .eq("id", payload.campaignId)
    .maybeSingle();
  if (campaignError || !campaign) {
    return NextResponse.json({ success: false, message: "Campaign not found." }, { status: 404 });
  }

  const parsedWorkflow = campaignWorkflowConfigV1Schema.safeParse(campaign.campaign_workflow);
  if (!parsedWorkflow.success) {
    return NextResponse.json({ success: false, message: "Campaign workflow config is invalid." }, { status: 400 });
  }
  const validationRules = parsedWorkflow.data.validationRules;

  if (validationRules.requireGpsBeforeSubmit
    && (typeof payload.gps?.latitude !== "number" || typeof payload.gps?.longitude !== "number")) {
    return NextResponse.json({ success: false, message: "GPS capture is required by campaign configuration." }, { status: 400 });
  }

  if (validationRules.requirePhotoEvidence && (payload.photos?.length ?? 0) < validationRules.minimumPhotos) {
    return NextResponse.json({ success: false, message: `At least ${validationRules.minimumPhotos} photo(s) are required.` }, { status: 400 });
  }

  let outletId = payload.selectedOutletRef.outletId;
  if (payload.selectedOutletRef.mode === "existing") {
    if (!outletId) {
      return NextResponse.json({ success: false, message: "Existing outlet selection is required." }, { status: 400 });
    }
  } else {
    const outletInput = payload.selectedOutletRef.outlet;
    if (!outletInput?.name?.trim()) {
      return NextResponse.json({ success: false, message: "Outlet name is required." }, { status: 400 });
    }

    const { data: rpcOutletId, error: rpcError } = await supabase.rpc("match_or_create_outlet", {
      p_organization_id: membership.organizationId,
      p_campaign_id: payload.campaignId,
      p_created_by: user.id,
      p_name: outletInput.name,
      p_outlet_type: outletInput.outletType ?? null,
      p_contact_person: outletInput.contactPerson ?? null,
      p_phone: outletInput.phone ?? null,
      p_address: outletInput.address ?? null,
      p_state: outletInput.state ?? campaign.state ?? null,
      p_lga: outletInput.lga ?? null,
      p_latitude: payload.gps?.latitude ?? null,
      p_longitude: payload.gps?.longitude ?? null,
      p_location_accuracy: payload.gps?.locationAccuracy ?? null,
      p_radius_meters: 250,
    });

    if (rpcError || !rpcOutletId) {
      return NextResponse.json({ success: false, message: rpcError?.message ?? "Failed to match or create outlet." }, { status: 500 });
    }
    outletId = String(rpcOutletId);
  }

  const visitId = dedupeVisitId;

  const { data: existingVisit } = await supabase
    .from("visits")
    .select("id, outlet_id, outcome")
    .eq("id", visitId)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();
  if (existingVisit) {
    return NextResponse.json({ success: true, visit: existingVisit, duplicate: true }, { status: 200 });
  }
  const activityPath = payload.activityPayloads.map((item) => item.activityId);
  const visitOutcome = mapWorkflowOutcomeToVisitOutcome(payload.outcome.code);

  const { data: visit, error: visitError } = await supabase
    .from("visits")
    .insert({
      id: visitId,
      organization_id: membership.organizationId,
      campaign_id: payload.campaignId,
      outlet_id: outletId,
      agent_id: user.id,
      outcome: visitOutcome,
      task_type: activityPath.includes("sell_to_outlet") ? "sell_to_outlet" : activityPath[0] ?? "register_outlet",
      task_payload: {
        activities: payload.activityPayloads,
        clientSubmissionMeta: {
          ...(payload.clientSubmissionMeta ?? {}),
          idempotencyKey: idempotencyKey ?? null,
          clientCreatedAt: payload.clientCreatedAt ?? null,
          deviceFingerprint: payload.deviceFingerprint ?? null,
        },
      },
      visit_activity_path: activityPath,
      visit_outcome_code: payload.outcome.code,
      visit_outcome_label: payload.outcome.label,
      state: payload.selectedOutletRef.outlet?.state ?? campaign.state ?? null,
      lga: payload.selectedOutletRef.outlet?.lga ?? null,
      latitude: payload.gps?.latitude ?? null,
      longitude: payload.gps?.longitude ?? null,
      location_accuracy: payload.gps?.locationAccuracy ?? null,
      sync_status: payload.syncStatus ?? "synced",
    })
    .select("id, outlet_id, outcome")
    .single();

  if (visitError || !visit) {
    if (visitError?.code === "23505") {
      const { data: duplicateVisit } = await supabase
        .from("visits")
        .select("id, outlet_id, outcome")
        .eq("id", visitId)
        .eq("organization_id", membership.organizationId)
        .maybeSingle();
      if (duplicateVisit) {
        return NextResponse.json({ success: true, visit: duplicateVisit, duplicate: true }, { status: 200 });
      }
    }
    return NextResponse.json({ success: false, message: visitError?.message ?? "Failed to create visit." }, { status: 500 });
  }

  const salesActivity = payload.activityPayloads.find((item) => item.activityId === "sell_to_outlet");
  const saleRows = (salesActivity?.payload?.sales as Array<Record<string, unknown>> | undefined) ?? [];
  if (saleRows.length > 0) {
    const rows = saleRows
      .filter((row) => Number(row.quantity ?? 0) > 0)
      .map((row) => ({
        id: randomUUID(),
        organization_id: membership.organizationId,
        campaign_id: payload.campaignId,
        outlet_id: outletId,
        visit_id: visit.id,
        agent_id: user.id,
        product_name: String(row.productName ?? row.productId ?? "Product"),
        quantity: Number(row.quantity ?? 0),
        sales_value: Number(row.price ?? 0) > 0 ? Number(row.price) : null,
        conversion_status: "converted",
        notes: typeof row.notes === "string" ? row.notes : null,
        latitude: payload.gps?.latitude ?? null,
        longitude: payload.gps?.longitude ?? null,
        location_accuracy: payload.gps?.locationAccuracy ?? null,
        sync_status: payload.syncStatus ?? "synced",
      }));

    if (rows.length > 0) {
      const { error: salesError } = await supabase.from("sales").insert(rows);
      if (salesError) {
        return NextResponse.json({ success: false, message: salesError.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ success: true, visit }, { status: 201 });
}
