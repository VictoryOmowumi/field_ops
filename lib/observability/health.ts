import { createServerSupabaseClient } from "@/lib/supabase/server";
import { recordSystemEvent } from "@/lib/observability/system-events";

export type HealthCheckResult = {
  status: "healthy" | "unhealthy";
  latencyMs: number;
  message?: string;
};

export async function checkDatabaseHealth(): Promise<HealthCheckResult> {
  const supabase = createServerSupabaseClient();
  const startedAt = Date.now();
  const { error } = await supabase.from("platform_settings").select("key", { head: true, count: "exact" }).limit(1);
  const latencyMs = Date.now() - startedAt;

  if (error) {
    await recordSystemEvent({
      eventType: "db_unreachable",
      severity: "critical",
      message: error.message,
      metadata: { latencyMs },
    });
    return { status: "unhealthy", latencyMs, message: error.message };
  }

  return { status: "healthy", latencyMs };
}

export async function checkStorageHealth(): Promise<HealthCheckResult> {
  const supabase = createServerSupabaseClient();
  const startedAt = Date.now();
  const { error } = await supabase.storage.getBucket("evidence");
  const latencyMs = Date.now() - startedAt;

  if (error) {
    await recordSystemEvent({
      eventType: "storage_unreachable",
      severity: "critical",
      message: error.message,
      metadata: { latencyMs },
    });
    return { status: "unhealthy", latencyMs, message: error.message };
  }

  return { status: "healthy", latencyMs };
}
