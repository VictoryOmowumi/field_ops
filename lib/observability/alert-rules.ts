import { createServerSupabaseClient } from "@/lib/supabase/server";
import { checkDatabaseHealth, checkStorageHealth } from "@/lib/observability/health";
import { sendOpsAlertEmail } from "@/lib/observability/alert-email";
import { CRITICAL_THROTTLE_MS, WARNING_THROTTLE_MS, recordAlertDispatched, wasAlertSentRecently } from "@/lib/observability/alert-throttle";
import type { SystemEventSeverity } from "@/lib/observability/system-events";

const SPIKE_WINDOW_MS = 15 * 60_000;
const UPLOAD_FAILURE_SPIKE_THRESHOLD = 10;
const SYNC_ERROR_SPIKE_THRESHOLD = 10;
const LOGIN_FAILURE_SPIKE_THRESHOLD = 50;
const SUBMISSION_DROP_RATIO = 0.3;
const PERFORMANCE_DEGRADATION_THRESHOLD = 5;

type AlertCandidate = {
  alertKey: string;
  severity: SystemEventSeverity;
  subject: string;
  message: string;
  metadata?: Record<string, unknown>;
};

async function countRecentEvents(eventType: string, sinceMs: number) {
  const supabase = createServerSupabaseClient();
  const since = new Date(Date.now() - sinceMs).toISOString();
  const { count } = await supabase
    .from("system_events")
    .select("id", { head: true, count: "exact" })
    .eq("event_type", eventType)
    .gte("created_at", since);
  return count ?? 0;
}

async function detectDatabaseUnhealthy(): Promise<AlertCandidate | null> {
  const result = await checkDatabaseHealth();
  if (result.status === "healthy") return null;
  return {
    alertKey: "db_unreachable",
    severity: "critical",
    subject: "Database unreachable",
    message: `Database health check failed: ${result.message ?? "unknown error"} (latency ${result.latencyMs}ms).`,
  };
}

async function detectStorageUnhealthy(): Promise<AlertCandidate | null> {
  const result = await checkStorageHealth();
  if (result.status === "healthy") return null;
  return {
    alertKey: "storage_unreachable",
    severity: "critical",
    subject: "Storage unreachable",
    message: `Storage health check failed: ${result.message ?? "unknown error"} (latency ${result.latencyMs}ms).`,
  };
}

async function detectUploadFailureSpike(): Promise<AlertCandidate | null> {
  const count = await countRecentEvents("upload_failed", SPIKE_WINDOW_MS);
  if (count <= UPLOAD_FAILURE_SPIKE_THRESHOLD) return null;
  return {
    alertKey: "upload_failed_spike",
    severity: "critical",
    subject: "Upload failure spike",
    message: `${count} upload failures in the last 15 minutes (threshold ${UPLOAD_FAILURE_SPIKE_THRESHOLD}).`,
    metadata: { count },
  };
}

async function detectSyncErrorSpike(): Promise<AlertCandidate | null> {
  const count = await countRecentEvents("unexpected_sync_error", SPIKE_WINDOW_MS);
  if (count <= SYNC_ERROR_SPIKE_THRESHOLD) return null;
  return {
    alertKey: "sync_error_spike",
    severity: "critical",
    subject: "Sync error spike",
    message: `${count} unexpected sync errors in the last 15 minutes (threshold ${SYNC_ERROR_SPIKE_THRESHOLD}).`,
    metadata: { count },
  };
}

async function detectLoginFailureSpike(): Promise<AlertCandidate | null> {
  const count = await countRecentEvents("login_failed", SPIKE_WINDOW_MS);
  if (count <= LOGIN_FAILURE_SPIKE_THRESHOLD) return null;
  return {
    alertKey: "login_failure_spike",
    severity: "warning",
    subject: "Login failure spike",
    message: `${count} failed logins in the last 15 minutes (threshold ${LOGIN_FAILURE_SPIKE_THRESHOLD}).`,
    metadata: { count },
  };
}

async function detectPerformanceDegradation(): Promise<AlertCandidate | null> {
  const supabase = createServerSupabaseClient();
  const since = new Date(Date.now() - SPIKE_WINDOW_MS).toISOString();
  const { count } = await supabase
    .from("system_events")
    .select("id", { head: true, count: "exact" })
    .eq("event_type", "performance_metric")
    .in("severity", ["warning", "critical"])
    .gte("created_at", since);

  if (!count || count <= PERFORMANCE_DEGRADATION_THRESHOLD) return null;
  return {
    alertKey: "performance_degradation",
    severity: "warning",
    subject: "Performance degradation",
    message: `${count} slow operations (>2s) in the last 15 minutes (threshold ${PERFORMANCE_DEGRADATION_THRESHOLD}).`,
    metadata: { count },
  };
}

async function detectSubmissionDrop(): Promise<AlertCandidate | null> {
  const now = new Date();
  if (now.getUTCHours() < 12) return null;

  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
  const yesterdaySameClockTime = new Date(yesterdayStart.getTime() + (now.getTime() - todayStart.getTime()));

  const supabase = createServerSupabaseClient();
  const [todayRes, yesterdayRes] = await Promise.all([
    supabase
      .from("visits")
      .select("id", { head: true, count: "exact" })
      .gte("created_at", todayStart.toISOString())
      .lte("created_at", now.toISOString()),
    supabase
      .from("visits")
      .select("id", { head: true, count: "exact" })
      .gte("created_at", yesterdayStart.toISOString())
      .lte("created_at", yesterdaySameClockTime.toISOString()),
  ]);

  const todayCount = todayRes.count ?? 0;
  const yesterdayCount = yesterdayRes.count ?? 0;
  if (yesterdayCount === 0 || todayCount >= SUBMISSION_DROP_RATIO * yesterdayCount) return null;

  return {
    alertKey: "submission_drop",
    severity: "warning",
    subject: "Submission volume drop",
    message: `Today's submissions (${todayCount}) are below ${Math.round(SUBMISSION_DROP_RATIO * 100)}% of yesterday's same-time volume (${yesterdayCount}).`,
    metadata: { todayCount, yesterdayCount },
  };
}

const DETECTORS = [
  detectDatabaseUnhealthy,
  detectStorageUnhealthy,
  detectUploadFailureSpike,
  detectSyncErrorSpike,
  detectLoginFailureSpike,
  detectSubmissionDrop,
  detectPerformanceDegradation,
];

export type { AlertCandidate };

/** Read-only: returns currently-active alert conditions with no email/throttle/dispatch side effects. */
export async function getActiveAlertCandidates(): Promise<AlertCandidate[]> {
  const candidates = await Promise.all(DETECTORS.map((detect) => detect()));
  return candidates.filter((candidate): candidate is AlertCandidate => candidate !== null);
}

export type AlertCheckResult = {
  alertKey: string;
  severity: SystemEventSeverity;
  triggered: boolean;
  throttled: boolean;
  sent: boolean;
  message?: string;
  error?: string;
};

export async function runAlertChecks(): Promise<AlertCheckResult[]> {
  const results: AlertCheckResult[] = [];
  const candidates = await getActiveAlertCandidates();

  for (const candidate of candidates) {
    const throttleMs = candidate.severity === "critical" ? CRITICAL_THROTTLE_MS : WARNING_THROTTLE_MS;
    const throttled = await wasAlertSentRecently(candidate.alertKey, throttleMs);

    if (throttled) {
      results.push({ alertKey: candidate.alertKey, severity: candidate.severity, triggered: true, throttled: true, sent: false, message: candidate.message });
      continue;
    }

    try {
      await sendOpsAlertEmail({
        subject: candidate.subject,
        severity: candidate.severity,
        message: candidate.message,
        metadata: candidate.metadata,
      });
      await recordAlertDispatched(candidate.alertKey, candidate.severity, candidate.message);
      results.push({ alertKey: candidate.alertKey, severity: candidate.severity, triggered: true, throttled: false, sent: true, message: candidate.message });
    } catch (error) {
      results.push({
        alertKey: candidate.alertKey,
        severity: candidate.severity,
        triggered: true,
        throttled: false,
        sent: false,
        message: candidate.message,
        error: (error as Error).message,
      });
    }
  }

  return results;
}
