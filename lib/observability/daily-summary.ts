import { createServerSupabaseClient } from "@/lib/supabase/server";

export type DailyHealthSummary = {
  date: string;
  totalSubmissions: number;
  activeUsers: number;
  failedLogins: number;
  errorCount: number;
  storageGrowthBytes: number;
  storageGrowthLabel: string;
  topCampaigns: Array<{ name: string; submissions: number }>;
  cpuRamNote: string;
};

function formatBytes(bytes: number) {
  if (bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export async function buildDailySummary(): Promise<DailyHealthSummary> {
  const supabase = createServerSupabaseClient();
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const [{ data: visits }, { data: events }, { data: evidence }, { data: campaigns }] = await Promise.all([
    supabase.from("visits").select("id, agent_id, campaign_id, created_at").gte("created_at", todayStart.toISOString()),
    supabase.from("system_events").select("id, event_type, severity, created_at").gte("created_at", todayStart.toISOString()),
    supabase.from("visit_evidence").select("id, compressed_file_size, created_at").gte("created_at", todayStart.toISOString()).is("deleted_at", null),
    supabase.from("campaigns").select("id, name"),
  ]);

  const visitRows = visits ?? [];
  const eventRows = events ?? [];
  const evidenceRows = evidence ?? [];
  const campaignNames = new Map((campaigns ?? []).map((c) => [c.id, c.name]));

  const activeUsers = new Set(visitRows.map((v) => v.agent_id).filter(Boolean)).size;
  const failedLogins = eventRows.filter((e) => e.event_type === "login_failed").length;
  const errorCount = eventRows.filter((e) => e.severity === "error" || e.severity === "critical").length;
  const storageGrowthBytes = evidenceRows.reduce((sum, row) => sum + (row.compressed_file_size ?? 0), 0);

  const submissionsByCampaign = new Map<string, number>();
  for (const visit of visitRows) {
    if (!visit.campaign_id) continue;
    submissionsByCampaign.set(visit.campaign_id, (submissionsByCampaign.get(visit.campaign_id) ?? 0) + 1);
  }
  const topCampaigns = Array.from(submissionsByCampaign.entries())
    .map(([campaignId, submissions]) => ({ name: campaignNames.get(campaignId) ?? "Unknown campaign", submissions }))
    .sort((a, b) => b.submissions - a.submissions)
    .slice(0, 5);

  return {
    date: todayStart.toISOString().slice(0, 10),
    totalSubmissions: visitRows.length,
    activeUsers,
    failedLogins,
    errorCount,
    storageGrowthBytes,
    storageGrowthLabel: formatBytes(storageGrowthBytes),
    topCampaigns,
    cpuRamNote: "Not available — requires Vercel API integration",
  };
}
