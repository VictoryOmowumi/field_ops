"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { MoreHorizontal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { supabaseClient } from "@/lib/supabase/client";
import type { PlatformCampaignDetail } from "@/types/platform";

export default function SuperAdminCampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const campaignId = params.id;
  const [campaign, setCampaign] = useState<PlatformCampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    async function loadCampaign() {
      const { data } = await supabaseClient.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setLoading(false);
        toast.error("Session expired. Please sign in again.");
        return;
      }
      const response = await fetch(`/api/platform/campaigns/${campaignId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = (await response.json()) as {
        success: boolean;
        message?: string;
        campaign?: PlatformCampaignDetail;
      };
      setLoading(false);
      if (!response.ok || !result.success || !result.campaign) {
        toast.error(result.message ?? "Failed to load campaign.");
        return;
      }
      setCampaign(result.campaign);
    }
    void loadCampaign();
  }, [campaignId]);

  async function exportPerformanceCsv() {
    setExporting(true);
    try {
      const { data } = await supabaseClient.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Session expired. Please sign in again.");
      const query = new URLSearchParams();
      if (dateFrom) query.set("dateFrom", dateFrom);
      if (dateTo) query.set("dateTo", dateTo);
      const response = await fetch(`/api/platform/campaigns/${campaignId}/performance/export?${query.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? "Failed to export performance report.");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `platform-campaign-${campaignId}-performance.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Performance report downloaded.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return <div className="rounded-3xl border border-border p-4 text-sm text-muted-foreground">Loading campaign...</div>;
  }
  if (!campaign) {
    return <div className="rounded-3xl border border-border p-4 text-sm text-muted-foreground">Campaign not found.</div>;
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/10">{campaign.status}</Badge>
            <span className="text-sm text-muted-foreground">{campaign.startDate} - {campaign.endDate}</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">{campaign.name}</h1>
          <p className="mt-1 max-w-4xl text-sm text-muted-foreground">{campaign.description}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Organization: <Link className="text-primary hover:underline" href={`/super-admin/organizations/${campaign.organizationId}`}>{campaign.organization}</Link>
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Button variant="outline" className="rounded-full" asChild><Link href="/super-admin/campaigns">Back</Link></Button>
          <Button className="rounded-full px-5" asChild><Link href={`/super-admin/organizations/${campaign.organizationId}/campaigns`}>Manage In Tenant</Link></Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="rounded-full px-4">
                <span className="inline-flex items-center gap-2">
                  <MoreHorizontal className="size-4" />
                  Actions
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => void exportPerformanceCsv()} disabled={exporting}>
                {exporting ? "Exporting KPI CSV..." : "Export KPI CSV"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

       <div className="flex gap-2">
          <div>
            <p className="mb-1 text-xs text-muted-foreground">From</p>
            <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          </div>
          <div>
            <p className="mb-1 text-xs text-muted-foreground">To</p>
            <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </div>
       </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total submissions" value={campaign.totalSubmissions} />
        <Stat label="Unique outlets" value={campaign.uniqueOutlets} />
        <Stat label="Conversions" value={campaign.conversions} />
        <Stat label="Pending uploads" value={campaign.pendingUploads} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Sales records" value={campaign.totalSalesRecords} />
        <Stat label="Evidence files" value={campaign.evidenceFiles} />
        <Stat label="Evidence storage (bytes)" value={campaign.evidenceStorageBytes} />
        <InfoStat label="Evidence storage" value={campaign.evidenceStorageLabel} />
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60 lg:col-span-7">
          <h2 className="font-semibold">Campaign Overview</h2>
          <p className="mt-1 text-sm text-muted-foreground">Cross-tenant execution summary for this campaign.</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Info label="Campaign ID" value={campaign.id} />
            <Info label="Organization ID" value={campaign.organizationId} />
            <Info label="Organization" value={campaign.organization} />
            <Info label="Sync Health" value={campaign.sync} />
            <Info label="Assigned reps" value={campaign.reps.toLocaleString()} />
            <Info label="Areas covered" value={campaign.areasCovered.toLocaleString()} />
            <Info label="Conversion rate" value={`${campaign.conversionRate.toFixed(1)}%`} />
            <Info label="Sales value" value={`NGN ${campaign.salesValue.toLocaleString()}`} />
            <Info label="POSM checks" value={campaign.posmChecks.toLocaleString()} />
            <Info label="POSM deployed" value={campaign.posmDeployed.toLocaleString()} />
            <Info label="POSM units" value={campaign.posmUnits.toLocaleString()} />
            <Info
              label="Unique outlets definition"
              value="Distinct outlet IDs that appear in campaign visit submissions."
            />
          </div>
        </section>

        <section className="rounded-4xl bg-foreground p-5 text-background shadow-sm lg:col-span-5">
          <h2 className="font-semibold">Governance Health</h2>
          <p className="mt-1 text-sm opacity-70">Super admin monitoring indicators.</p>
          <div className="mt-6 space-y-4">
            <Health label="Photo compliance" value={campaign.sync} />
            <Health label="GPS capture rate" value={campaign.sync} />
            <Health label="Upload success rate" value={campaign.sync} />
          </div>
        </section>
      </div>

      <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <h2 className="font-semibold">Recent Activity</h2>
        <p className="mt-1 text-sm text-muted-foreground">Latest submissions from the assigned organization team.</p>
        <div className="mt-5 overflow-hidden rounded-3xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Rep</th>
                <th className="px-4 py-3 text-left font-medium">Outlet</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {campaign.recentActivity.map((item) => (
                <tr key={`${item.rep}-${item.time}`} className="border-t border-border">
                  <td className="px-4 py-4 font-medium">{item.rep}</td>
                  <td className="px-4 py-4 text-muted-foreground">{item.outlet}</td>
                  <td className="px-4 py-4">{item.status}</td>
                  <td className="px-4 py-4 text-muted-foreground">{item.time}</td>
                </tr>
              ))}
              {campaign.recentActivity.length === 0 ? (
                <tr className="border-t border-border"><td className="px-4 py-4 text-muted-foreground" colSpan={4}>No recent activity.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[1.6rem] bg-card p-5 shadow-sm ring-1 ring-border/60">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value.toLocaleString()}</p>
    </div>
  );
}

function InfoStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.6rem] bg-card p-5 shadow-sm ring-1 ring-border/60">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl bg-background p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}

function Health({ label, value }: { label: string; value: string }) {
  const width = value.endsWith("%") ? value : "0%";
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="opacity-70">{label}</span>
        <span>{value}</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-background/10">
        <div className="h-full rounded-full bg-primary" style={{ width }} />
      </div>
    </div>
  );
}
