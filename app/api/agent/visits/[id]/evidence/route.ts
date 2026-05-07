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

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
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
    .select("id, organization_id, agent_id")
    .eq("id", visitId)
    .eq("organization_id", membership.organizationId)
    .eq("agent_id", user.id)
    .maybeSingle();

  if (visitError || !visit) return forbidden();

  const formData = await request.formData();
  const file = formData.get("file");
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "").trim();
  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, message: "file is required." }, { status: 400 });
  }

  const safeFileName = sanitizeFileName(file.name || "evidence.jpg");
  const filePath = `${membership.organizationId}/${visitId}/${idempotencyKey || Date.now().toString()}-${safeFileName}`;

  if (idempotencyKey) {
    const { data: duplicateEvidence } = await supabase
      .from("visit_evidence")
      .select("id, file_url, file_name, file_type, file_size, created_at")
      .eq("organization_id", membership.organizationId)
      .eq("visit_id", visitId)
      .eq("file_name", file.name)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (duplicateEvidence) {
      return NextResponse.json({ success: true, evidence: duplicateEvidence, duplicate: true }, { status: 200 });
    }
  }
  const bytes = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from("evidence")
    .upload(filePath, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ success: false, message: uploadError.message }, { status: 500 });
  }

  const { data, error: evidenceError } = await supabase
    .from("visit_evidence")
    .insert({
      organization_id: membership.organizationId,
      visit_id: visitId,
      file_url: filePath,
      file_name: file.name,
      file_type: file.type || null,
      file_size: file.size,
    })
    .select("id, file_url, file_name, file_type, file_size, created_at")
    .single();

  if (evidenceError || !data) {
    return NextResponse.json({ success: false, message: evidenceError?.message ?? "Failed to save evidence." }, { status: 500 });
  }

  return NextResponse.json({ success: true, evidence: data }, { status: 201 });
}
