import { NextRequest, NextResponse } from "next/server";

import { getOrgMembershipForUser, hasAllowedOrgRole } from "@/lib/auth/org-access";
import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
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

export async function DELETE(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["admin", "super_admin"])) return forbidden();
  const membership = await getOrgMembershipForUser(user.id);
  if (!membership || !hasAllowedOrgRole(membership.role, ["org_admin", "supervisor"])) return forbidden();

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { reason?: string } | null;
  const reason = body?.reason?.trim() || null;
  const supabase = createServerSupabaseClient();

  const { data: evidence, error: evidenceError } = await supabase
    .from("visit_evidence")
    .select("id, organization_id, file_url, storage_provider, deleted_at")
    .eq("id", id)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();

  if (evidenceError) {
    return NextResponse.json({ success: false, message: evidenceError.message }, { status: 500 });
  }
  if (!evidence) {
    return NextResponse.json({ success: false, message: "Evidence not found." }, { status: 404 });
  }
  if (evidence.deleted_at) {
    return NextResponse.json({ success: true, alreadyDeleted: true });
  }

  const { error: updateError } = await supabase
    .from("visit_evidence")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: user.id,
      delete_reason: reason,
    })
    .eq("id", evidence.id)
    .eq("organization_id", membership.organizationId);

  if (updateError) {
    return NextResponse.json({ success: false, message: updateError.message }, { status: 500 });
  }

  let storageDeleted = false;
  let storageWarning: string | null = null;
  if (evidence.file_url) {
    const result = await storageProvider.deleteEvidenceFile({
      file_url: evidence.file_url,
      storage_provider: evidence.storage_provider,
    });
    storageDeleted = result.deleted;
    storageWarning = result.warning ?? null;
  }

  return NextResponse.json({
    success: true,
    storageDeleted,
    storageWarning,
  });
}
