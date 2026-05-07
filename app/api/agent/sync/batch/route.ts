import { NextRequest, NextResponse } from "next/server";

import { getPrimaryOrgMembership } from "@/lib/auth/org-context";
import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type SyncItem = {
  entityType: "outlet" | "visit" | "sale" | "photo";
  idempotencyKey: string;
  payload: Record<string, unknown>;
};

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}
function forbidden() {
  return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["agent", "admin", "super_admin"])) return forbidden();
  const membership = await getPrimaryOrgMembership(user.id);
  if (!membership) return forbidden();

  const body = (await request.json()) as { items?: SyncItem[] };
  const items = body.items ?? [];
  const supabase = createServerSupabaseClient();

  const results: Array<{
    idempotencyKey: string;
    status: "synced" | "duplicate" | "failed_retryable" | "failed_terminal";
    message?: string;
  }> = [];

  for (const item of items) {
    try {
      if (item.entityType === "outlet") {
        const payload = {
          ...item.payload,
          organization_id: membership.organizationId,
          created_by: user.id,
        };
        const id = String((item.payload as Record<string, unknown>).id ?? "");
        if (id) {
          const { data: existing } = await supabase
            .from("outlets")
            .select("id")
            .eq("id", id)
            .eq("organization_id", membership.organizationId)
            .maybeSingle();
          if (existing) {
            results.push({ idempotencyKey: item.idempotencyKey, status: "duplicate" });
            continue;
          }
        }
        const { error } = await supabase.from("outlets").insert(payload);
        if (error) throw error;
      } else if (item.entityType === "visit") {
        const payload = {
          ...item.payload,
          organization_id: membership.organizationId,
          agent_id: user.id,
        };
        const id = String((item.payload as Record<string, unknown>).id ?? "");
        if (!id) throw new Error("Visit id is required for sync.");
        const { data: existing } = await supabase
          .from("visits")
          .select("id")
          .eq("id", id)
          .eq("organization_id", membership.organizationId)
          .maybeSingle();
        if (existing) {
          results.push({ idempotencyKey: item.idempotencyKey, status: "duplicate" });
          continue;
        }
        const { error } = await supabase.from("visits").insert(payload);
        if (error) throw error;
      } else if (item.entityType === "sale") {
        const payload = {
          ...item.payload,
          organization_id: membership.organizationId,
          agent_id: user.id,
        };
        const id = String((item.payload as Record<string, unknown>).id ?? "");
        if (!id) throw new Error("Sale id is required for sync.");
        const { data: existing } = await supabase
          .from("sales")
          .select("id")
          .eq("id", id)
          .eq("organization_id", membership.organizationId)
          .maybeSingle();
        if (existing) {
          results.push({ idempotencyKey: item.idempotencyKey, status: "duplicate" });
          continue;
        }
        const { error } = await supabase.from("sales").insert(payload);
        if (error) throw error;
      } else if (item.entityType === "photo") {
        const payload = {
          ...item.payload,
          organization_id: membership.organizationId,
        };
        const id = String((item.payload as Record<string, unknown>).id ?? "");
        if (!id) throw new Error("Photo evidence id is required for sync.");
        const { data: existing } = await supabase
          .from("visit_evidence")
          .select("id")
          .eq("id", id)
          .eq("organization_id", membership.organizationId)
          .maybeSingle();
        if (existing) {
          results.push({ idempotencyKey: item.idempotencyKey, status: "duplicate" });
          continue;
        }
        const { error } = await supabase.from("visit_evidence").insert(payload);
        if (error) throw error;
      }

      results.push({ idempotencyKey: item.idempotencyKey, status: "synced" });
    } catch (error) {
      const message = (error as Error).message;
      const terminal = /required|invalid|violates/i.test(message);
      results.push({
        idempotencyKey: item.idempotencyKey,
        status: terminal ? "failed_terminal" : "failed_retryable",
        message,
      });
    }
  }

  return NextResponse.json({ success: true, results });
}
