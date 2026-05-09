"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import CampaignPointMap from "@/components/campaign/CampaignPointMap";
import EvidenceGallery from "@/components/shared/EvidenceGallery";
import type {
  CampaignActivityRow,
  CampaignAnalyticsSummary,
  CampaignEvidenceItem,
  CampaignMapPoint,
} from "@/types/campaign-intelligence";

type SharedCampaignPayload = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  state: string | null;
  lga: string | null;
  start_date: string | null;
  end_date: string | null;
};

export default function SharedCampaignPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [campaign, setCampaign] = useState<SharedCampaignPayload | null>(null);
  const [summary, setSummary] = useState<CampaignAnalyticsSummary | null>(null);
  const [mapPoints, setMapPoints] = useState<CampaignMapPoint[]>([]);
  const [activities, setActivities] = useState<CampaignActivityRow[]>([]);
  const [evidence, setEvidence] = useState<CampaignEvidenceItem[]>([]);

  useEffect(() => {
    async function load() {
      const response = await fetch(`/api/shared/campaigns/${token}`, { cache: "no-store" });
      const result = await response.json();
      setLoading(false);
      if (!response.ok || !result.success) {
        setError(result.message ?? "Could not load shared campaign.");
        return;
      }
      setCampaign(result.campaign);
      setSummary(result.summary);
      setMapPoints(result.mapPoints ?? []);
      setActivities(result.activities ?? []);
      setEvidence(result.evidence ?? []);
    }
    void load();
  }, [token]);

  if (loading) {
    return <main className="mx-auto max-w-7xl space-y-4 p-6 text-sm text-muted-foreground">Loading shared campaign...</main>;
  }

  if (error || !campaign || !summary) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h1 className="text-xl font-semibold">Shared campaign unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error ?? "This link is invalid or expired."}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-6 pb-10">
      <section className="rounded-3xl border border-border bg-card p-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Shared Campaign View</p>
        <h1 className="mt-2 text-3xl font-semibold">{campaign.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{campaign.description ?? "No campaign description."}</p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Total submissions" value={String(summary.totalSubmissions)} />
        <Stat label="Unique outlets" value={String(summary.uniqueOutlets)} />
        <Stat label="Areas covered" value={String(summary.areasCovered)} />
        <Stat label="Conversion rate" value={`${summary.conversionRate.toFixed(1)}%`} />
        <Stat label="Sync health" value={`${summary.syncHealth.toFixed(1)}%`} />
      </section>

      <section className="rounded-3xl border border-border bg-card p-5">
        <h2 className="font-semibold">Coverage Map</h2>
        <p className="text-sm text-muted-foreground">Plotted coordinates from visit and sales activity.</p>
        <div className="mt-4">
          <CampaignPointMap points={mapPoints} />
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-card p-5">
        <h2 className="font-semibold">Captured Activity</h2>
        <div className="mt-4 overflow-hidden rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Outlet</th>
                <th className="px-4 py-3 text-left">Actor</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Time</th>
              </tr>
            </thead>
            <tbody>
              {activities.length === 0 ? (
                <tr className="border-t border-border">
                  <td className="px-4 py-6 text-muted-foreground" colSpan={5}>No activity yet.</td>
                </tr>
              ) : (
                activities.map((item) => (
                  <tr key={item.id} className="border-t border-border">
                    <td className="px-4 py-4 capitalize">{item.type}</td>
                    <td className="px-4 py-4">{item.outlet}</td>
                    <td className="px-4 py-4">{item.actor}</td>
                    <td className="px-4 py-4 capitalize">{item.status}</td>
                    <td className="px-4 py-4 text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-card p-5">
        <h2 className="font-semibold">Photo Evidence</h2>
        <div className="mt-4">
          <EvidenceGallery evidence={evidence} />
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

