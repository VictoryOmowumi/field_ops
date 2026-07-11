import { NextRequest, NextResponse } from "next/server";

import { getPrimaryOrgMembership } from "@/lib/auth/org-context";
import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { captureException } from "@/lib/observability/sentry";
import { recordSystemEvent } from "@/lib/observability/system-events";
import { recordPerformanceMetric } from "@/lib/observability/performance";
import { storageProvider } from "@/lib/storage";

type RouteContext = {
  params: Promise<{ id: string }>;
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
  const supabase = createServerSupabaseClient();

  const { data: visit, error: visitError } = await supabase
    .from("visits")
    .select("id, organization_id, agent_id, campaign_id")
    .eq("id", visitId)
    .eq("organization_id", membership.organizationId)
    .eq("agent_id", user.id)
    .maybeSingle();

  if (visitError || !visit) return forbidden();

  const formData = await request.formData();
  const file = formData.get("file");
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "").trim();
  const originalFileName = String(formData.get("originalFileName") ?? "").trim();
  const originalFileSizeRaw = Number(formData.get("originalFileSize") ?? NaN);
  const compressedFileSizeRaw = Number(formData.get("compressedFileSize") ?? NaN);
  const uploadedMimeType = String(formData.get("mimeType") ?? "").trim();
  const originalFileSize = Number.isFinite(originalFileSizeRaw) && originalFileSizeRaw > 0 ? originalFileSizeRaw : null;
  const compressedFileSize = Number.isFinite(compressedFileSizeRaw) && compressedFileSizeRaw > 0 ? compressedFileSizeRaw : null;
  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, message: "file is required." }, { status: 400 });
  }

  if (idempotencyKey) {
    const { data: duplicateEvidence } = await supabase
      .from("visit_evidence")
      .select("id, file_url, file_name, file_type, file_size, original_file_name, original_file_size, compressed_file_size, mime_type, created_at")
      .eq("organization_id", membership.organizationId)
      .eq("visit_id", visitId)
      .eq("file_name", file.name)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (duplicateEvidence) {
      return NextResponse.json({ success: true, evidence: duplicateEvidence, duplicate: true }, { status: 200 });
    }
  }
  const bytes = await file.arrayBuffer();

  const uploadStartedAt = Date.now();
  let uploaded: Awaited<ReturnType<typeof storageProvider.uploadEvidenceFile>>;
  try {
    uploaded = await storageProvider.uploadEvidenceFile({
      organizationId: membership.organizationId,
      visitId,
      fileName: file.name || "evidence.jpg",
      contentType: file.type || "application/octet-stream",
      bytes,
      idempotencyKey,
    });
  } catch (uploadError) {
    const message = uploadError instanceof Error ? uploadError.message : "Failed to upload evidence file.";
    captureException(uploadError, {
      userId: user.id,
      organizationId: membership.organizationId,
      route: "/api/agent/visits/[id]/evidence",
    });
    await recordSystemEvent({
      eventType: "upload_failed",
      severity: "error",
      message,
      organizationId: membership.organizationId,
      metadata: { visitId },
    });
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
  const uploadDurationMs = Date.now() - uploadStartedAt;
  void recordPerformanceMetric({
    metricType: "upload",
    operation: "evidence_upload",
    durationMs: uploadDurationMs,
    organizationId: membership.organizationId,
  });

  const { data, error: evidenceError } = await supabase
    .from("visit_evidence")
    .insert({
      organization_id: membership.organizationId,
      visit_id: visitId,
      campaign_id: visit.campaign_id,
      file_url: uploaded.path,
      storage_provider: uploaded.storageProvider,
      bucket: uploaded.bucket,
      object_key: uploaded.objectKey,
      file_name: file.name,
      file_type: file.type || null,
      file_size: file.size,
      original_file_name: originalFileName || file.name,
      original_file_size: originalFileSize,
      compressed_file_size: compressedFileSize ?? file.size,
      mime_type: uploadedMimeType || file.type || null,
    })
    .select("id, file_url, file_name, file_type, file_size, original_file_name, original_file_size, compressed_file_size, mime_type, created_at")
    .single();

  if (evidenceError || !data) {
    return NextResponse.json({ success: false, message: evidenceError?.message ?? "Failed to save evidence." }, { status: 500 });
  }

  return NextResponse.json({ success: true, evidence: data }, { status: 201 });
}
