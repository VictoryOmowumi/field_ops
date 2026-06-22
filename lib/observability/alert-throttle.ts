import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { SystemEventSeverity } from "@/lib/observability/system-events";

export const CRITICAL_THROTTLE_MS = 15 * 60_000;
export const WARNING_THROTTLE_MS = 60 * 60_000;

export async function wasAlertSentRecently(alertKey: string, windowMs: number) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("system_events")
    .select("created_at")
    .eq("event_type", "alert_dispatched")
    .filter("metadata->>alertKey", "eq", alertKey)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return false;
  return Date.now() - new Date(data.created_at).getTime() < windowMs;
}

export async function recordAlertDispatched(alertKey: string, severity: SystemEventSeverity, summary: string) {
  const supabase = createServerSupabaseClient();
  await supabase.from("system_events").insert({
    event_type: "alert_dispatched",
    severity,
    message: summary,
    metadata: { alertKey },
  });
}
