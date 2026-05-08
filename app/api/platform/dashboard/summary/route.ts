import { NextRequest, NextResponse } from "next/server";

import { requireSuperAdmin, titleCase } from "@/lib/platform/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { PlatformDashboardSummary, PlatformIncidentLikeItem } from "@/types/platform";

function minutesAgoLabel(timestamp: string) {
  const diff = Math.max(0, Date.now() - new Date(timestamp).getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} mins ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs} hr${hrs > 1 ? "s" : ""} ago`;
}

export async function GET(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (auth.error) return auth.error;

  const supabase = createServerSupabaseClient();
  const [{ data: organizations }, { data: campaigns }, { data: orgUsers }, { data: visits }, { data: sales }] =
    await Promise.all([
      supabase.from("organizations").select("id, name, status"),
      supabase.from("campaigns").select("id, organization_id, status"),
      supabase.from("organization_users").select("organization_id, role, status, invite_sent_at, accepted_at"),
      supabase.from("visits").select("id, organization_id, sync_status, created_at, outcome"),
      supabase.from("sales").select("id, organization_id, sync_status, created_at"),
    ]);

  const orgs = organizations ?? [];
  const camp = campaigns ?? [];
  const users = orgUsers ?? [];
  const visitRows = visits ?? [];
  const salesRows = sales ?? [];

  const now = Date.now();
  const syncWindowStart = now - 7 * 24 * 60 * 60 * 1000;
  const recentVisits = visitRows.filter((row) => new Date(row.created_at).getTime() >= syncWindowStart);
  const recentSales = salesRows.filter((row) => new Date(row.created_at).getTime() >= syncWindowStart);
  const totalSyncRows = recentVisits.length + recentSales.length;
  const syncedRows =
    recentVisits.filter((row) => row.sync_status === "synced").length +
    recentSales.filter((row) => row.sync_status === "synced").length;
  const syncSuccessRate = totalSyncRows > 0 ? `${((syncedRows / totalSyncRows) * 100).toFixed(1)}%` : "100.0%";

  const freshThreshold = now - 5 * 60 * 1000;
  const freshVisits = visitRows.filter((row) => new Date(row.created_at).getTime() >= freshThreshold).length;
  const freshWindowStart = now - 24 * 60 * 60 * 1000;
  const recentVisitBase = visitRows.filter((row) => new Date(row.created_at).getTime() >= freshWindowStart).length;
  const freshnessUnder5Min = recentVisitBase > 0 ? `${((freshVisits / recentVisitBase) * 100).toFixed(1)}%` : "100.0%";

  const inviteWindowStart = now - 30 * 24 * 60 * 60 * 1000;
  const invitedUsers = users.filter((row) => row.invite_sent_at && new Date(row.invite_sent_at).getTime() >= inviteWindowStart).length;
  const acceptedUsers = users.filter(
    (row) => row.accepted_at && row.invite_sent_at && new Date(row.invite_sent_at).getTime() >= inviteWindowStart
  ).length;
  const inviteRate = invitedUsers > 0 ? (acceptedUsers / invitedUsers) * 100 : 100;
  const inviteCompletionRate =
    `${Math.min(100, Math.max(0, inviteRate)).toFixed(1)}%`;

  const campaignsByOrg = new Map<string, number>();
  for (const c of camp) campaignsByOrg.set(c.organization_id, (campaignsByOrg.get(c.organization_id) ?? 0) + 1);

  const repsByOrg = new Map<string, number>();
  for (const u of users) {
    if (u.role === "agent") repsByOrg.set(u.organization_id, (repsByOrg.get(u.organization_id) ?? 0) + 1);
  }

  const incidents: PlatformIncidentLikeItem[] = [];
  for (const org of orgs) {
    const orgVisitRows = visitRows.filter((row) => row.organization_id === org.id);
    const orgSalesRows = salesRows.filter((row) => row.organization_id === org.id);
    const orgTotal = orgVisitRows.length + orgSalesRows.length;
    const orgSynced =
      orgVisitRows.filter((row) => row.sync_status === "synced").length +
      orgSalesRows.filter((row) => row.sync_status === "synced").length;
    const orgRate = orgTotal > 0 ? (orgSynced / orgTotal) * 100 : 100;

    if (orgRate < 95) {
      incidents.push({
        organization: org.name,
        issue: "Upload success dropped below 95%",
        severity: orgRate < 85 ? "High" : "Medium",
        time: "Now",
      });
    }

    const oldInvite = users.find(
      (row) =>
        row.organization_id === org.id &&
        row.status === "invited" &&
        row.invite_sent_at &&
        now - new Date(row.invite_sent_at).getTime() > 48 * 60 * 60 * 1000
    );
    if (oldInvite?.invite_sent_at) {
      incidents.push({
        organization: org.name,
        issue: "Admin invite not accepted",
        severity: "Low",
        time: minutesAgoLabel(oldInvite.invite_sent_at),
      });
    }
  }

  const summary: PlatformDashboardSummary = {
    organizations: orgs.length,
    activeOrganizations: orgs.filter((org) => org.status === "active").length,
    totalCampaigns: camp.length,
    totalReps: Array.from(repsByOrg.values()).reduce((a, b) => a + b, 0),
    syncSuccessRate,
    freshnessUnder5Min,
    inviteCompletionRate,
    organizationSnapshot: orgs.slice(0, 20).map((org) => ({
      id: org.id,
      name: org.name,
      status: titleCase(org.status),
      totalCampaigns: campaignsByOrg.get(org.id) ?? 0,
    })),
    incidents: incidents.slice(0, 10),
  };

  return NextResponse.json({ success: true, summary });
}
