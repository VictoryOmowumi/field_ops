"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { Download, Moon, Sun } from "lucide-react";

import EvidenceGallery from "@/components/shared/EvidenceGallery";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useThemeMode } from "@/hooks/useThemeMode";
import type { CampaignActivityRow, CampaignAnalyticsSummary, CampaignEvidenceItem, CampaignMapPoint } from "@/types/campaign-intelligence";
import BackofficeBrand from "@/components/backoffice/BackofficeBrand";
const CampaignPointMap = dynamic(() => import("@/components/campaign/CampaignPointMap"), {
  ssr: false,
  loading: () => <div className="h-72 rounded-3xl border border-border bg-muted/30" />,
});

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

const PAGE_SIZE = 10;

function flattenRecord(input: unknown, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  if (input === null || input === undefined) return out;
  if (typeof input !== "object") {
    out[prefix || "value"] = String(input);
    return out;
  }

  if (Array.isArray(input)) {
    input.forEach((item, index) => {
      const nextPrefix = prefix ? `${prefix}.${index}` : String(index);
      const flat = flattenRecord(item, nextPrefix);
      Object.assign(out, flat);
    });
    return out;
  }

  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    if (value === null || value === undefined) {
      out[nextPrefix] = "";
    } else if (typeof value === "object") {
      Object.assign(out, flattenRecord(value, nextPrefix));
    } else {
      out[nextPrefix] = String(value);
    }
  }
  return out;
}

function extractReadableDetails(activity: CampaignActivityRow) {
  const payload = (activity.taskPayload ?? {}) as {
    activities?: Array<{ activityId?: string; payload?: Record<string, unknown> }>;
  };
  const details: Array<{ label: string; value: string }> = [];
  for (const item of payload.activities ?? []) {
    const activityName = item.activityId?.replaceAll("_", " ") ?? "activity";
    const fields = item.payload ?? {};
    for (const [key, rawValue] of Object.entries(fields)) {
      if (key === "products" && Array.isArray(rawValue)) {
        const rows = rawValue
          .map((entry) => {
            if (!entry || typeof entry !== "object") return null;
            const typed = entry as Record<string, unknown>;
            const name = String(typed.productName ?? typed.product ?? "");
            const available = typed.available === true ? "Available" : typed.available === false ? "Not available" : "";
            const price = typed.price ? ` @ ${typed.price}` : "";
            return [name, available, price].filter(Boolean).join(" ");
          })
          .filter(Boolean);
        if (rows.length > 0) {
          details.push({ label: `${activityName} products`, value: rows.join(" | ") });
        }
        continue;
      }
      if (rawValue === null || rawValue === undefined || rawValue === "") continue;
      if (typeof rawValue === "object") continue;
      details.push({
        label: `${activityName} ${key.replaceAll("_", " ")}`,
        value: String(rawValue),
      });
    }
  }
  return details;
}

export default function SharedCampaignPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const { theme, toggleTheme } = useThemeMode();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [campaign, setCampaign] = useState<SharedCampaignPayload | null>(null);
  const [summary, setSummary] = useState<CampaignAnalyticsSummary | null>(null);
  const [mapPoints, setMapPoints] = useState<CampaignMapPoint[]>([]);
  const [activities, setActivities] = useState<CampaignActivityRow[]>([]);
  const [evidence, setEvidence] = useState<CampaignEvidenceItem[]>([]);

  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState("all");
  const [actorFilter, setActorFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedActivity, setSelectedActivity] = useState<CampaignActivityRow | null>(null);

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

  const evidenceByVisit = useMemo(() => {
    const map = new Map<string, CampaignEvidenceItem[]>();
    for (const item of evidence) {
      const list = map.get(item.visit_id) ?? [];
      list.push(item);
      map.set(item.visit_id, list);
    }
    return map;
  }, [evidence]);

  const areaOptions = useMemo(
    () => ["all", ...Array.from(new Set(activities.map((a) => a.area || "-"))).sort((a, b) => a.localeCompare(b))],
    [activities]
  );
  const actorOptions = useMemo(
    () => ["all", ...Array.from(new Set(activities.map((a) => a.actor || "-"))).sort((a, b) => a.localeCompare(b))],
    [activities]
  );

  const filteredActivities = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activities.filter((item) => {
      if (areaFilter !== "all" && (item.area || "-") !== areaFilter) return false;
      if (actorFilter !== "all" && (item.actor || "-") !== actorFilter) return false;
      if (!q) return true;
      return [
        item.customer,
        item.outlet,
        item.area,
        item.products,
        item.location,
        item.actor,
        item.status,
        item.taskType,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [activities, search, areaFilter, actorFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredActivities.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pagedActivities = filteredActivities.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);
  const selectedDetails = useMemo(
    () => (selectedActivity ? extractReadableDetails(selectedActivity) : []),
    [selectedActivity]
  );

  function exportRawDataCsv() {
    const baseRows = filteredActivities.map((item) => {
      const visitId = item.id.startsWith("visit-") ? item.id.replace("visit-", "") : item.id;
      const visitEvidence = evidenceByVisit.get(visitId) ?? [];
      const payloadFlat = flattenRecord(item.taskPayload ?? {}, "payload");
      const saleFlat = flattenRecord(item.saleLines ?? [], "sales");
      const row: Record<string, string> = {
        activity_id: item.id,
        type: item.type,
        task_type: item.taskType ?? "",
        customer: item.customer ?? "",
        outlet: item.outlet ?? "",
        area_lga: item.area ?? "",
        products: item.products ?? "",
        location: item.location ?? "",
        actor: item.actor ?? "",
        status: item.status ?? "",
        created_at: item.createdAt ?? "",
        evidence_count: String(visitEvidence.length),
        evidence_paths: visitEvidence.map((entry) => entry.file_url).join(" | "),
        evidence_signed_urls: visitEvidence.map((entry) => entry.signed_url ?? "").filter(Boolean).join(" | "),
      };
      Object.assign(row, payloadFlat, saleFlat);
      return row;
    });

    const headerSet = new Set<string>();
    for (const row of baseRows) {
      Object.keys(row).forEach((key) => headerSet.add(key));
    }
    const headers = Array.from(headerSet);
    const escape = (value: string) => `"${String(value).replace(/"/g, "\"\"")}"`;
    const csv = [
      headers.join(","),
      ...baseRows.map((row) => headers.map((key) => escape(row[key] ?? "")).join(",")),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shared-campaign-${campaign?.id ?? "export"}-raw-data.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

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
      <header className="sticky top-3 z-40 flex items-center justify-between rounded-2xl border border-border bg-card/95 px-4 py-3 backdrop-blur">
        <BackofficeBrand homeHref="/" />
        <div className="flex items-center gap-2">
          <Button variant="outline" className="rounded-full" onClick={exportRawDataCsv}>
            <Download className="size-4" />
            Export Raw Data
          </Button>
          <Button variant="outline" size="icon" className="rounded-full" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
        </div>
      </header>

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
        <div className="mt-4 grid gap-2 md:grid-cols-4">
          <Input
            placeholder="Search customer/outlet/area/products/actor"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <Select
            value={areaFilter}
            onValueChange={(value) => {
              setAreaFilter(value);
              setPage(1);
            }}
          >
            <SelectTrigger><SelectValue placeholder="Area" /></SelectTrigger>
            <SelectContent>
              {areaOptions.map((option) => (
                <SelectItem key={option} value={option}>{option === "all" ? "All areas" : option}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={actorFilter}
            onValueChange={(value) => {
              setActorFilter(value);
              setPage(1);
            }}
          >
            <SelectTrigger><SelectValue placeholder="Actor" /></SelectTrigger>
            <SelectContent>
              {actorOptions.map((option) => (
                <SelectItem key={option} value={option}>{option === "all" ? "All actors" : option}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="text-right text-xs text-muted-foreground self-center">
            {filteredActivities.length} result(s)
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Customer</th>
                <th className="px-4 py-3 text-left">Outlet</th>
                <th className="px-4 py-3 text-left">Area</th>
                <th className="px-4 py-3 text-left">Products</th>
                <th className="px-4 py-3 text-left">Location</th>
                <th className="px-4 py-3 text-left">Actor</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Action</th>
              </tr>
            </thead>
            <tbody>
              {pagedActivities.length === 0 ? (
                <tr className="border-t border-border">
                  <td className="px-4 py-6 text-muted-foreground" colSpan={10}>No activity yet.</td>
                </tr>
              ) : (
                pagedActivities.map((item) => (
                  <tr key={item.id} className="border-t border-border">
                    <td className="px-4 py-4 capitalize">{item.taskType ?? item.type}</td>
                    <td className="px-4 py-4">{item.customer ?? "-"}</td>
                    <td className="px-4 py-4">{item.outlet}</td>
                    <td className="px-4 py-4">{item.area ?? "-"}</td>
                    <td className="px-4 py-4">{item.products ?? "-"}</td>
                    <td className="px-4 py-4 text-muted-foreground">{item.location ?? "-"}</td>
                    <td className="px-4 py-4">{item.actor}</td>
                    <td className="px-4 py-4 capitalize">{item.status}</td>
                    <td className="px-4 py-4 text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-4">
                      <Button variant="outline" className="h-8 rounded-full px-3 text-xs" onClick={() => setSelectedActivity(item)}>
                        View
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
          <p>
            Page {pageSafe} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="rounded-full" disabled={pageSafe <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Previous
            </Button>
            <Button variant="outline" className="rounded-full" disabled={pageSafe >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              Next
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-card p-5">
        <h2 className="font-semibold">Photo Evidence</h2>
        <div className="mt-4">
          <EvidenceGallery evidence={evidence} />
        </div>
      </section>

      <Dialog open={Boolean(selectedActivity)} onOpenChange={(open) => !open && setSelectedActivity(null)}>
        <DialogContent className="max-w-5xl! h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Activity Details</DialogTitle>
          </DialogHeader>
          {selectedActivity ? (
            <div className="space-y-3 text-sm">
              <p><strong>Customer:</strong> {selectedActivity.customer ?? "-"}</p>
              <p><strong>Outlet:</strong> {selectedActivity.outlet}</p>
              <p><strong>Area:</strong> {selectedActivity.area ?? "-"}</p>
              <p><strong>Products:</strong> {selectedActivity.products ?? "-"}</p>
              <p><strong>Location:</strong> {selectedActivity.location ?? "-"}</p>
              <p><strong>Actor:</strong> {selectedActivity.actor}</p>
              <p><strong>Status:</strong> {selectedActivity.status}</p>
              <p><strong>Date:</strong> {new Date(selectedActivity.createdAt).toLocaleString()}</p>
              <div className="rounded-xl border border-border bg-muted/30 p-3">
                <p className="mb-2 text-xs uppercase text-muted-foreground">Captured form details</p>
                {selectedDetails.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No additional form fields captured.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedDetails.map((row, index) => (
                      <div key={`${row.label}-${index}`} className="rounded-lg bg-background px-3 py-2">
                        <p className="text-xs text-muted-foreground">{row.label}</p>
                        <p className="text-sm font-medium">{row.value}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {(selectedActivity.saleLines ?? []).length > 0 ? (
                <div className="rounded-xl border border-border bg-muted/30 p-3">
                  <p className="mb-2 text-xs uppercase text-muted-foreground">Sales lines</p>
                  <div className="space-y-2">
                    {(selectedActivity.saleLines ?? []).map((line) => (
                      <div key={line.id} className="rounded-lg bg-background px-3 py-2 text-sm">
                        <p className="font-medium">{line.product_name ?? "Unnamed product"}</p>
                        <p className="text-xs text-muted-foreground">Quantity: {line.quantity ?? 0}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
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
