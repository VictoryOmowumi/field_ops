import { recordSystemEvent, type SystemEventSeverity } from "@/lib/observability/system-events";
import { SLOW_QUERY_CRITICAL_MS, SLOW_QUERY_WARNING_MS } from "@/lib/observability/thresholds";

export type PerformanceMetricType = "visit_submission" | "upload" | "endpoint" | "query";

function severityForDuration(durationMs: number): SystemEventSeverity {
  if (durationMs >= SLOW_QUERY_CRITICAL_MS) return "critical";
  if (durationMs >= SLOW_QUERY_WARNING_MS) return "warning";
  return "info";
}

export async function recordPerformanceMetric(input: {
  metricType: PerformanceMetricType;
  operation: string;
  durationMs: number;
  organizationId?: string | null;
}) {
  await recordSystemEvent({
    eventType: "performance_metric",
    severity: severityForDuration(input.durationMs),
    message: `${input.operation} took ${input.durationMs}ms`,
    organizationId: input.organizationId ?? null,
    metadata: { metricType: input.metricType, operation: input.operation, durationMs: input.durationMs },
  });
}

export async function withPerformanceTracking<T>(
  metricType: PerformanceMetricType,
  operation: string,
  fn: () => Promise<T>,
  organizationId?: string | null
): Promise<T> {
  const startedAt = Date.now();
  try {
    return await fn();
  } finally {
    const durationMs = Date.now() - startedAt;
    void recordPerformanceMetric({ metricType, operation, durationMs, organizationId });
  }
}
