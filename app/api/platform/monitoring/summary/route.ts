import { NextRequest, NextResponse } from "next/server";

import { requireSuperAdmin } from "@/lib/platform/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { checkDatabaseHealth, checkStorageHealth } from "@/lib/observability/health";
import { getActiveAlertCandidates } from "@/lib/observability/alert-rules";
import { bucketCountsByHour, bucketDistinctByHour } from "@/lib/observability/time-buckets";
import { STORAGE_WARNING_GB } from "@/lib/observability/thresholds";
import type { PlatformMonitoringSummary } from "@/types/platform";

export async function GET(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (auth.error) return auth.error;

  const startedAt = Date.now();
  const supabase = createServerSupabaseClient();

  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const lastHour = new Date(now.getTime() - 60 * 60 * 1000);
  const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    { data: recentEvents },
    { data: recentVisits },
    { data: recentEvidence },
    { count: activeCampaignsCount },
    { count: todayVelocityVisits },
    { count: totalVisitsCount },
    { count: totalSalesCount },
    { count: totalImageCount },
    { data: recentEvidenceSizes },
    dbHealth,
    storageHealth,
    activeAlertCandidates,
  ] = await Promise.all([
    supabase
      .from("system_events")
      .select("id, event_type, severity, message, organization_id, metadata, created_at")
      .gte("created_at", last24h.toISOString())
      .order("created_at", { ascending: false }),
    supabase
      .from("visits")
      .select("id, agent_id, created_at")
      .gte("created_at", last24h.toISOString()),
    supabase
      .from("visit_evidence")
      .select("id, created_at")
      .gte("created_at", last24h.toISOString())
      .is("deleted_at", null),
    supabase.from("campaigns").select("id", { head: true, count: "exact" }).eq("status", "active"),
    supabase.from("visits").select("id", { head: true, count: "exact" }).gte("created_at", lastHour.toISOString()),
    supabase.from("visits").select("id", { head: true, count: "exact" }),
    supabase.from("sales").select("id", { head: true, count: "exact" }),
    supabase.from("visit_evidence").select("id", { head: true, count: "exact" }).is("deleted_at", null),
    supabase.from("visit_evidence").select("compressed_file_size, created_at").gte("created_at", last7Days.toISOString()).is("deleted_at", null),
    checkDatabaseHealth(),
    checkStorageHealth(),
    getActiveAlertCandidates(),
  ]);

  const events = recentEvents ?? [];
  const visits = recentVisits ?? [];
  const evidence = recentEvidence ?? [];

  const todayEvents = events.filter((e) => new Date(e.created_at) >= todayStart);
  const todayVisits = visits.filter((v) => new Date(v.created_at) >= todayStart);
  const todayEvidence = evidence.filter((e) => new Date(e.created_at) >= todayStart);

  const loginFailedEvents = events.filter((e) => e.event_type === "login_failed");
  const uploadFailedEvents = events.filter((e) => e.event_type === "upload_failed");
  const todayLoginFailed = todayEvents.filter((e) => e.event_type === "login_failed");
  const todayLoginSucceeded = todayEvents.filter((e) => e.event_type === "login_succeeded");

  const totalLoginAttemptsToday = todayLoginFailed.length + todayLoginSucceeded.length;
  const failureRate = totalLoginAttemptsToday > 0 ? `${((todayLoginFailed.length / totalLoginAttemptsToday) * 100).toFixed(1)}%` : "0.0%";

  const authEventCounts = new Map<string, number>();
  for (const event of todayLoginFailed) {
    authEventCounts.set(event.message, (authEventCounts.get(event.message) ?? 0) + 1);
  }
  const topAuthEvents = Array.from(authEventCounts.entries())
    .map(([message, count]) => ({ message, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const activeRepIdsToday = new Set(todayVisits.map((v) => v.agent_id).filter(Boolean));

  const todayPerfMetrics = todayEvents.filter((e) => e.event_type === "performance_metric");
  function avgDurationFor(metricType: string) {
    const matches = todayPerfMetrics.filter((e) => (e.metadata as Record<string, unknown> | null)?.metricType === metricType);
    if (matches.length === 0) return 0;
    const total = matches.reduce((sum, e) => sum + Number((e.metadata as Record<string, unknown>).durationMs ?? 0), 0);
    return Math.round(total / matches.length);
  }
  const slowEndpointCount = todayPerfMetrics.filter(
    (e) => (e.metadata as Record<string, unknown> | null)?.metricType === "endpoint" && (e.severity === "warning" || e.severity === "critical")
  ).length;
  const slowQueryCount = todayPerfMetrics.filter(
    (e) => (e.metadata as Record<string, unknown> | null)?.metricType === "query" && (e.severity === "warning" || e.severity === "critical")
  ).length;

  const evidenceSizes = recentEvidenceSizes ?? [];
  const totalEvidenceBytes7d = evidenceSizes.reduce((sum, row) => sum + (row.compressed_file_size ?? 0), 0);
  const averageImageSizeBytes = evidenceSizes.length > 0 ? Math.round(totalEvidenceBytes7d / evidenceSizes.length) : 0;
  const estimatedMonthlyGrowthBytes = Math.round((totalEvidenceBytes7d / 7) * 30);
  const storageWarningBytes = STORAGE_WARNING_GB * 1024 * 1024 * 1024;

  const apiLatencyMs = Date.now() - startedAt;

  const summary: PlatformMonitoringSummary = {
    generatedAt: now.toISOString(),
    apiLatencyMs,
    infrastructure: {
      database: { status: dbHealth.status, latencyMs: dbHealth.latencyMs, message: dbHealth.message },
      storage: { status: storageHealth.status, latencyMs: storageHealth.latencyMs, message: storageHealth.message },
      api: { status: "healthy", latencyMs: apiLatencyMs },
      sentry: { status: process.env.SENTRY_DSN ? "configured" : "not_configured" },
    },
    activity: {
      submissionsToday: todayVisits.length,
      submissionsSparkline: bucketCountsByHour(visits.map((v) => v.created_at)),
      photosUploadedToday: todayEvidence.length,
      photosSparkline: bucketCountsByHour(evidence.map((e) => e.created_at)),
      activeRepsToday: activeRepIdsToday.size,
      activeRepsSparkline: bucketDistinctByHour(
        visits.filter((v) => v.agent_id).map((v) => ({ createdAt: v.created_at, key: v.agent_id as string }))
      ),
      failedLoginsToday: todayLoginFailed.length,
      failedLoginsSparkline: bucketCountsByHour(loginFailedEvents.map((e) => e.created_at)),
      uploadFailuresToday: todayEvents.filter((e) => e.event_type === "upload_failed").length,
      uploadFailuresSparkline: bucketCountsByHour(uploadFailedEvents.map((e) => e.created_at)),
    },
    errors: events
      .filter((e) => !(e.event_type === "performance_metric" && e.severity === "info"))
      .slice(0, 20)
      .map((e) => ({
        id: e.id,
        createdAt: e.created_at,
        severity: e.severity,
        eventType: e.event_type,
        message: e.message,
        organizationId: e.organization_id,
      })),
    alerts: activeAlertCandidates.map((c) => ({
      alertKey: c.alertKey,
      severity: c.severity,
      subject: c.subject,
      message: c.message,
    })),
    auth: {
      successfulLoginsToday: todayLoginSucceeded.length,
      failedLoginsToday: todayLoginFailed.length,
      failureRate,
      topAuthEvents,
    },
    campaignActivity: {
      totalSubmissionsToday: todayVisits.length,
      activeCampaigns: activeCampaignsCount ?? 0,
      activeReps: activeRepIdsToday.size,
      photosUploaded: todayEvidence.length,
      submissionVelocityPerHour: todayVelocityVisits ?? 0,
    },
    importTracking: {
      importedRecords: 0,
      appCapturedRecords: totalVisitsCount ?? 0,
      importBatches: 0,
      importErrors: 0,
    },
    performance: {
      avgVisitSubmissionMs: avgDurationFor("visit_submission"),
      avgUploadMs: avgDurationFor("upload"),
      slowEndpointCount,
      slowQueryCount,
    },
    costInsights: {
      storage: {
        imageCount: totalImageCount ?? 0,
        averageImageSizeBytes,
        estimatedMonthlyGrowthBytes,
        warningThresholdBytes: storageWarningBytes,
        approachingLimit: estimatedMonthlyGrowthBytes >= storageWarningBytes,
      },
      database: {
        totalRecordsStored: (totalVisitsCount ?? 0) + (totalSalesCount ?? 0) + (totalImageCount ?? 0),
        note: "Proxy for DB activity (total rows stored), not true query counts — requires Supabase Management API for query-level metering.",
      },
      supabaseDisk: {
        available: false,
        note: "Requires SUPABASE_ACCESS_TOKEN + project ref (Supabase Management API).",
      },
      vercelUsage: {
        available: false,
        note: "Requires VERCEL_API_TOKEN (Vercel Usage API).",
      },
    },
  };

  return NextResponse.json({ success: true, summary });
}
