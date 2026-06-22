import { createServerSupabaseClient } from "@/lib/supabase/server";

export type SystemEventType =
  | "upload_failed"
  | "db_unreachable"
  | "storage_unreachable"
  | "email_send_failed"
  | "unexpected_sync_error"
  | "login_failed"
  | "login_succeeded"
  | "alert_dispatched"
  | "performance_metric";

export type SystemEventSeverity = "info" | "warning" | "error" | "critical";

export async function recordSystemEvent(input: {
  eventType: SystemEventType;
  severity: SystemEventSeverity;
  message: string;
  organizationId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    const supabase = createServerSupabaseClient();
    await supabase.from("system_events").insert({
      event_type: input.eventType,
      severity: input.severity,
      message: input.message,
      organization_id: input.organizationId ?? null,
      metadata: input.metadata ?? null,
    });
  } catch (error) {
    console.error("Failed to record system event", error);
  }
}
