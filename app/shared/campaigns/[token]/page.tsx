"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { addMonths, endOfMonth, format, getDay, isSameDay, isWithinInterval, startOfMonth, subMonths } from "date-fns";
import { Area, AreaChart, BarChart, Bar, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Download, ImageIcon, MapPin, Moon, Search, Sun, X } from "lucide-react";

import EvidenceGallery from "@/components/shared/EvidenceGallery";
import BackofficeBrand from "@/components/backoffice/BackofficeBrand";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useThemeMode } from "@/hooks/useThemeMode";
import { COLOR_PRESET_REGISTRY } from "@/lib/tenant-experience/theme-presets";
import type { CampaignActivityRow, CampaignAnalyticsSummary, CampaignEvidenceItem, CampaignEvidencePagination, CampaignMapPoint } from "@/types/campaign-intelligence";
import { cn } from "@/lib/utils";

const CampaignPointMap = dynamic(() => import("@/components/campaign/CampaignPointMap"), {
  ssr: false,
  loading: () => <div className="h-72 rounded-3xl border border-border bg-muted/30 animate-pulse" />,
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

type SharedBrand = {
  name: string;
  logoUrl: string | null;
  colorPreset: string | null;
  fontUrl: string | null;
  uiVariant: string | null;
};

type TabId = "map" | "data" | "media";

const PAGE_SIZE = 20;
const FONT_LINK_ID = "actiq-shared-font";
const THEME_STYLE_ID = "actiq-shared-theme";
const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function parseFontFamily(url: string): string | null {
  try {
    const params = new URL(url).searchParams.getAll("family");
    return params[0]?.split(":")[0]?.trim() || null;
  } catch { return null; }
}

function applySharedBrandTheme(brand: SharedBrand) {
  if (typeof document === "undefined") return;
  const colorEntry = brand.colorPreset ? (COLOR_PRESET_REGISTRY[brand.colorPreset] ?? null) : null;
  const existingLink = document.getElementById(FONT_LINK_ID);
  if (brand.fontUrl) {
    if (!(existingLink instanceof HTMLLinkElement) || existingLink.href !== brand.fontUrl) {
      existingLink?.remove();
      const link = document.createElement("link");
      link.id = FONT_LINK_ID; link.rel = "stylesheet"; link.href = brand.fontUrl;
      document.head.appendChild(link);
    }
  } else { existingLink?.remove(); }
  const fontFamily = brand.fontUrl ? parseFontFamily(brand.fontUrl) : null;
  if (!colorEntry && !fontFamily) { document.getElementById(THEME_STYLE_ID)?.remove(); return; }
  let el = document.getElementById(THEME_STYLE_ID) as HTMLStyleElement | null;
  if (!el) { el = document.createElement("style"); el.id = THEME_STYLE_ID; document.head.appendChild(el); }
  const fontLine = fontFamily ? `  --font-sans: '${fontFamily}', sans-serif;` : "";
  const lightVars = [fontLine, ...(colorEntry ? Object.entries(colorEntry.light).map(([k, v]) => `  ${k}: ${v};`) : [])].filter(Boolean).join("\n");
  const darkVars = colorEntry ? Object.entries(colorEntry.dark).map(([k, v]) => `  ${k}: ${v};`).join("\n") : "";
  el.textContent = `:root {\n${lightVars}\n}${darkVars ? `\n.dark {\n${darkVars}\n}` : ""}`;
}

function parseDateValue(value: string): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function formatDateValue(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function DateRangeCalendar({
  dateFrom,
  dateTo,
  onChange,
}: {
  dateFrom: string;
  dateTo: string;
  onChange: (range: { from: string; to: string }) => void;
}) {
  const selectedFrom = parseDateValue(dateFrom);
  const selectedTo = parseDateValue(dateTo);
  const [visibleMonth, setVisibleMonth] = useState(() => selectedFrom ?? new Date());

  const days = useMemo(() => {
    const monthStart = startOfMonth(visibleMonth);
    const monthEnd = endOfMonth(visibleMonth);
    const leadingDays = getDay(monthStart);
    const dates: (Date | null)[] = Array.from({ length: leadingDays }, () => null);

    for (let day = 1; day <= monthEnd.getDate(); day += 1) {
      dates.push(new Date(monthStart.getFullYear(), monthStart.getMonth(), day));
    }

    return dates;
  }, [visibleMonth]);

  function handleDateSelect(date: Date) {
    if (!selectedFrom || selectedTo) {
      onChange({ from: formatDateValue(date), to: "" });
      return;
    }

    if (date < selectedFrom) {
      onChange({ from: formatDateValue(date), to: "" });
      return;
    }

    onChange({ from: dateFrom, to: formatDateValue(date) });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Previous month"
          onClick={() => setVisibleMonth((month) => subMonths(month, 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <p className="text-sm font-medium">{format(visibleMonth, "MMMM yyyy")}</p>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Next month"
          onClick={() => setVisibleMonth((month) => addMonths(month, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
        {WEEKDAY_LABELS.map((label) => <span key={label}>{label}</span>)}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((date, index) => {
          const isSelectedStart = Boolean(date && selectedFrom && isSameDay(date, selectedFrom));
          const isSelectedEnd = Boolean(date && selectedTo && isSameDay(date, selectedTo));
          const isInRange = Boolean(date && selectedFrom && selectedTo && isWithinInterval(date, { start: selectedFrom, end: selectedTo }));

          return date ? (
            <button
              key={formatDateValue(date)}
              type="button"
              onClick={() => handleDateSelect(date)}
              className={cn(
                "h-9 rounded-xl text-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                isInRange && "bg-primary/10 text-primary",
                (isSelectedStart || isSelectedEnd) && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
              )}
            >
              {date.getDate()}
            </button>
          ) : (
            <span key={`empty-${index}`} className="h-9" />
          );
        })}
      </div>
    </div>
  );
}

function flattenRecord(input: unknown, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  if (input === null || input === undefined) return out;
  if (typeof input !== "object") { out[prefix || "value"] = String(input); return out; }
  if (Array.isArray(input)) {
    input.forEach((item, i) => Object.assign(out, flattenRecord(item, prefix ? `${prefix}.${i}` : String(i))));
    return out;
  }
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const next = prefix ? `${prefix}.${key}` : key;
    if (value === null || value === undefined) out[next] = "";
    else if (typeof value === "object") Object.assign(out, flattenRecord(value, next));
    else out[next] = String(value);
  }
  return out;
}

function extractReadableDetails(activity: CampaignActivityRow) {
  const payload = (activity.taskPayload ?? {}) as { activities?: Array<{ activityId?: string; payload?: Record<string, unknown> }> };
  const details: Array<{ label: string; value: string }> = [];
  for (const item of payload.activities ?? []) {
    const name = item.activityId?.replaceAll("_", " ") ?? "activity";
    for (const [key, rawValue] of Object.entries(item.payload ?? {})) {
      if (key === "products" && Array.isArray(rawValue)) {
        const rows = rawValue.map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const t = entry as Record<string, unknown>;
          return [String(t.productName ?? t.product ?? ""), t.available === true ? "Available" : t.available === false ? "Not available" : "", t.price ? `@ ${t.price}` : ""].filter(Boolean).join(" ");
        }).filter(Boolean);
        if (rows.length) details.push({ label: `${name} products`, value: rows.join(" | ") });
        continue;
      }
      if (rawValue === null || rawValue === undefined || rawValue === "" || typeof rawValue === "object") continue;
      details.push({ label: `${name} ${key.replaceAll("_", " ")}`, value: String(rawValue) });
    }
  }
  return details;
}

function activityBadgeClass(status: string) {
  if (status === "converted") return "bg-emerald-500/10 text-emerald-600";
  if (status === "onboarded") return "bg-sky-500/10 text-sky-600";
  if (status === "pending") return "bg-amber-500/10 text-amber-600";
  if (status === "revisit") return "bg-violet-500/10 text-violet-600";
  return "bg-muted text-muted-foreground";
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SharedCampaignPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const { theme, toggleTheme } = useThemeMode();

  const [loading, setLoading] = useState(true);
  const [loadingSections, setLoadingSections] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [campaign, setCampaign] = useState<SharedCampaignPayload | null>(null);
  const [summary, setSummary] = useState<CampaignAnalyticsSummary | null>(null);
  const [brand, setBrand] = useState<SharedBrand | null>(null);
  const [mapPoints, setMapPoints] = useState<CampaignMapPoint[]>([]);
  const [activities, setActivities] = useState<CampaignActivityRow[]>([]);
  const [activitiesTotal, setActivitiesTotal] = useState(0);
  const [evidence, setEvidence] = useState<CampaignEvidenceItem[]>([]);
  const [evidencePagination, setEvidencePagination] = useState<CampaignEvidencePagination>({ page: 1, pageSize: 20, total: 0, hasMore: false });
  const [loadingMoreEvidence, setLoadingMoreEvidence] = useState(false);

  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState("all");
  const [actorFilter, setActorFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [selectedActivity, setSelectedActivity] = useState<CampaignActivityRow | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<CampaignEvidenceItem | null>(null);

  const [activeTab, setActiveTab] = useState<TabId>("map");
  // Incremented each time the map tab is activated → triggers invalidateSize()
  const [mapTabActivations, setMapTabActivations] = useState(0);

  function goToTab(tab: TabId) {
    setActiveTab(tab);
    if (tab === "map") {
      setMapTabActivations((n) => n + 1);
    }
  }

  // ── Load summary + brand ────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const q = new URLSearchParams({ section: "summary" });
      if (dateFrom) q.set("dateFrom", dateFrom);
      if (dateTo) q.set("dateTo", dateTo);
      if (areaFilter !== "all") q.set("area", areaFilter);
      const res = await fetch(`/api/shared/campaigns/${token}?${q.toString()}`, { cache: "no-store" });
      const data = await res.json();
      setLoading(false);
      if (!res.ok || !data.success) { setError(data.message ?? "Could not load."); return; }
      setCampaign(data.campaign);
      setSummary(data.summary);
      if (data.brand) {
        const b = data.brand as SharedBrand;
        setBrand(b);
        if (b.uiVariant === "enhanced") applySharedBrandTheme(b);
      }
    }
    void load();
  }, [token, dateFrom, dateTo, areaFilter]);

  // ── Load map + activities + evidence ───────────────────────────────────
  useEffect(() => {
    if (!campaign) return;
    let cancelled = false;
    async function loadSections() {
      setLoadingSections(true);
      const base = new URLSearchParams();
      if (dateFrom) base.set("dateFrom", dateFrom);
      if (dateTo) base.set("dateTo", dateTo);
      if (areaFilter !== "all") base.set("area", areaFilter);
      const bo = Object.fromEntries(base.entries());

      const [actRes, mapRes, evRes] = await Promise.all([
        fetch(`/api/shared/campaigns/${token}?${new URLSearchParams({ ...bo, section: "activities", activityPage: String(page), activityPageSize: String(PAGE_SIZE) })}`, { cache: "no-store" }),
        fetch(`/api/shared/campaigns/${token}?${new URLSearchParams({ ...bo, section: "map" })}`, { cache: "no-store" }),
        fetch(`/api/shared/campaigns/${token}?${new URLSearchParams({ ...bo, section: "evidence", evidencePage: "1", evidencePageSize: "20" })}`, { cache: "no-store" }),
      ]);
      const [actJson, mapJson, evJson] = await Promise.all([actRes.json().catch(() => null), mapRes.json().catch(() => null), evRes.json().catch(() => null)]);
      if (cancelled) return;
      if (actRes.ok && actJson?.success) { setActivities(actJson.activities ?? []); setActivitiesTotal(Number(actJson.totalActivities ?? 0)); }
      else { setActivities([]); setActivitiesTotal(0); }
      if (mapRes.ok && mapJson?.success) setMapPoints(mapJson.mapPoints ?? []);
      else setMapPoints([]);
      if (evRes.ok && evJson?.success) { setEvidence(evJson.evidence ?? []); setEvidencePagination(evJson.pagination ?? { page: 1, pageSize: 20, total: (evJson.evidence ?? []).length, hasMore: false }); }
      else { setEvidence([]); setEvidencePagination({ page: 1, pageSize: 20, total: 0, hasMore: false }); }
      setLoadingSections(false);
    }
    void loadSections();
    return () => { cancelled = true; };
  }, [campaign, token, dateFrom, dateTo, areaFilter, page]);

  async function loadMoreEvidence() {
    if (loadingMoreEvidence || !evidencePagination.hasMore) return;
    setLoadingMoreEvidence(true);
    try {
      const q = new URLSearchParams({ evidenceOnly: "1", evidencePage: String(evidencePagination.page + 1), evidencePageSize: String(evidencePagination.pageSize) });
      if (dateFrom) q.set("dateFrom", dateFrom);
      if (dateTo) q.set("dateTo", dateTo);
      if (areaFilter !== "all") q.set("area", areaFilter);
      const res = await fetch(`/api/shared/campaigns/${token}?${q}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) return;
      setEvidence((prev) => { const seen = new Set(prev.map((e) => e.id)); return [...prev, ...(data.evidence ?? []).filter((e: CampaignEvidenceItem) => !seen.has(e.id))]; });
      if (data.pagination) setEvidencePagination(data.pagination as CampaignEvidencePagination);
    } finally { setLoadingMoreEvidence(false); }
  }

  const evidenceByVisit = useMemo(() => {
    const map = new Map<string, CampaignEvidenceItem[]>();
    for (const item of evidence) { const list = map.get(item.visit_id) ?? []; list.push(item); map.set(item.visit_id, list); }
    return map;
  }, [evidence]);

  const areaOptions = useMemo(() => ["all", ...Array.from(new Set(activities.map((a) => a.area || "-"))).sort()], [activities]);
  const actorOptions = useMemo(() => ["all", ...Array.from(new Set(activities.map((a) => a.actor || "-"))).sort()], [activities]);

  const filteredActivities = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activities.filter((item) => {
      if (areaFilter !== "all" && (item.area || "-") !== areaFilter) return false;
      if (actorFilter !== "all" && (item.actor || "-") !== actorFilter) return false;
      if (!q) return true;
      return [item.customer, item.outlet, item.area, item.products, item.location, item.actor, item.status, item.taskType].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
    });
  }, [activities, search, areaFilter, actorFilter]);

  const totalPages = Math.max(1, Math.ceil(activitiesTotal / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const selectedDetails = useMemo(() => (selectedActivity ? extractReadableDetails(selectedActivity) : []), [selectedActivity]);
  const dateRangeLabel = useMemo(() => {
    const from = parseDateValue(dateFrom);
    const to = parseDateValue(dateTo);

    if (from && to) return `${format(from, "LLL dd, yyyy")} - ${format(to, "LLL dd, yyyy")}`;
    if (from) return `${format(from, "LLL dd, yyyy")} - Pick end date`;
    if (to) return `Until ${format(to, "LLL dd, yyyy")}`;
    return "Pick a date range";
  }, [dateFrom, dateTo]);

  function exportRawDataCsv() {
    const rows = filteredActivities.map((item) => {
      const visitId = item.id.startsWith("visit-") ? item.id.replace("visit-", "") : item.id;
      const evids = evidenceByVisit.get(visitId) ?? [];
      const row: Record<string, string> = { activity_id: item.id, type: item.type, task_type: item.taskType ?? "", customer: item.customer ?? "", outlet: item.outlet ?? "", area_lga: item.area ?? "", products: item.products ?? "", actor: item.actor ?? "", status: item.status ?? "", created_at: item.createdAt ?? "", evidence_count: String(evids.length), evidence_urls: evids.map((e) => e.signed_url ?? "").filter(Boolean).join(" | ") };
      Object.assign(row, flattenRecord(item.taskPayload ?? {}, "payload"), flattenRecord(item.saleLines ?? [], "sales"));
      return row;
    });
    const headerSet = new Set<string>();
    rows.forEach((r) => Object.keys(r).forEach((k) => headerSet.add(k)));
    const headers = Array.from(headerSet);
    const esc = (v: string) => `"${String(v).replace(/"/g, "\"\"")}"`;
    const csv = [headers.join(","), ...rows.map((r) => headers.map((k) => esc(r[k] ?? "")).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    a.download = `campaign-${campaign?.id ?? "export"}.csv`;
    a.click();
  }

  // ── Loading / error states ──────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="space-y-3 text-center">
          <div className="mx-auto size-10 animate-spin rounded-full border-2 border-border border-t-primary" />
          <p className="text-sm text-muted-foreground">Loading campaign report…</p>
        </div>
      </div>
    );
  }

  if (error || !campaign || !summary) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center">
          <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-muted">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-muted-foreground">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
              <path d="M12 8v4m0 4h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold">Campaign unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error ?? "This link is invalid or has expired."}</p>
        </div>
      </main>
    );
  }

  const isEnhanced = brand?.uiVariant === "enhanced";

  // ════════════════════════════════════════════════════════════════════════
  // Classic — pre-tenant-experience layout
  // ════════════════════════════════════════════════════════════════════════
  if (!isEnhanced) {
    return (
      <main className="mx-auto container space-y-6 p-2 lg:p-6 pb-10">
        <header className="sticky top-3 z-40 flex items-center justify-between px-4 py-3 backdrop-blur">
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

        <section>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Shared Campaign View</p>
          <h1 className="mt-2 text-3xl font-semibold">{campaign.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{campaign.description ?? "No campaign description."}</p>
        </section>

        <section className="rounded-3xl border border-border bg-card p-4">
          <div className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]">
            <Input
              type="date"
              aria-label="Date range start"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
            <Input
              type="date"
              aria-label="Date range end"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
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
            <Button variant="outline" className="rounded-full" onClick={() => {
              setDateFrom("");
              setDateTo("");
              setAreaFilter("all");
            }}>
              Clear filters
            </Button>
          </div>
        </section>

        <section className="grid gap-4 grid-cols-2 lg:grid-cols-5">
          <Stat label="Total submissions" value={String(summary.totalSubmissions)} trend={summary.recentTrend} dataKey="submissions" />
          <Stat label="Unique outlets" value={String(summary.uniqueOutlets)} trend={summary.recentTrend} dataKey="submissions" />
          <Stat label="Areas covered" value={String(summary.areasCovered)} trend={summary.recentTrend} dataKey="submissions" />
          <Stat label="Conversion rate" value={`${summary.conversionRate.toFixed(1)}%`} trend={summary.recentTrend} dataKey="conversions" />
          <Stat label="Sync health" value={`${summary.syncHealth.toFixed(1)}%`} trend={summary.recentTrend} dataKey="submissions" />
          <Stat label="Converted visits" value={String(summary.conversions)} trend={summary.recentTrend} dataKey="conversions" />
          <Stat
            label="Sales count"
            value={`${summary.salesCount ?? 0}${typeof summary.unitsSold === "number" ? ` (${summary.unitsSold})` : ""}`}
            trend={summary.recentTrend}
            dataKey="conversions"
          />
          <Stat label="POSM deployed" value={String(summary.posmDeployed)} trend={summary.recentTrend} dataKey="submissions" />
          <Stat label="POSM units" value={String(summary.posmUnits)} trend={summary.recentTrend} dataKey="submissions" />
        </section>

        <section className="rounded-3xl border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">Coverage Map</h2>
            {loadingSections ? <span className="text-xs text-muted-foreground">Updating map...</span> : null}
          </div>
          <p className="text-sm text-muted-foreground">Plotted coordinates from visit activity. Tooltip shows sale quantity when available.</p>
          <div className="relative mt-4">
            {loadingSections && mapPoints.length === 0 ? (
              <div className="h-72 rounded-3xl border border-border bg-muted/30" />
            ) : (
              <CampaignPointMap points={mapPoints} />
            )}
            {loadingSections && mapPoints.length > 0 ? (
              <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-3xl bg-background/35 backdrop-blur-[1px]">
                <span className="rounded-full border border-border bg-background/90 px-3 py-1 text-xs text-muted-foreground">
                  Refreshing map...
                </span>
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">Captured Activity</h2>
            {loadingSections ? <span className="text-xs text-muted-foreground">Updating table...</span> : null}
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-3">
            <Input
              placeholder="Search customer/outlet/area/products/actor"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
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
              {activitiesTotal} result(s)
            </div>
          </div>

          <div className="relative mt-4 overflow-x-auto rounded-2xl border border-border">
            <table className="min-w-[1100px] w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
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
                {loadingSections && filteredActivities.length === 0 ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <tr key={`loading-row-${index}`} className="border-t border-border">
                      <td className="px-4 py-4" colSpan={9}>
                        <div className="h-4 w-full animate-pulse rounded bg-muted/60" />
                      </td>
                    </tr>
                  ))
                ) : filteredActivities.length === 0 ? (
                  <tr className="border-t border-border">
                    <td className="px-4 py-6 text-muted-foreground" colSpan={9}>No activity yet.</td>
                  </tr>
                ) : (
                  filteredActivities.map((item) => (
                    <tr key={item.id} className="border-t border-border">
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
            {loadingSections && filteredActivities.length > 0 ? (
              <div className="pointer-events-none absolute inset-0 grid place-items-start rounded-2xl bg-background/20">
                <span className="mt-3 rounded-full border border-border bg-background/90 px-3 py-1 text-xs text-muted-foreground">
                  Refreshing rows...
                </span>
              </div>
            ) : null}
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
          {evidencePagination.hasMore ? (
            <div className="mt-3">
              <Button variant="outline" className="rounded-full" disabled={loadingMoreEvidence} onClick={loadMoreEvidence}>
                {loadingMoreEvidence ? "Loading..." : "Load more"}
              </Button>
            </div>
          ) : null}
        </section>

        <Dialog open={Boolean(selectedActivity)} onOpenChange={(open) => !open && setSelectedActivity(null)}>
          <DialogContent className="max-w-5xl! max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Activity Details</DialogTitle>
            </DialogHeader>
            {selectedActivity ? (
              <div className="space-y-4 text-sm">
                <div className="grid gap-3 md:grid-cols-3">
                  <Detail label="Customer" value={selectedActivity.customer ?? "-"} />
                  <Detail label="Outlet" value={selectedActivity.outlet} />
                  <Detail label="Area" value={selectedActivity.area ?? "-"} />
                  <Detail label="Products" value={selectedActivity.products ?? "-"} />
                  <Detail label="Location" value={selectedActivity.location ?? "-"} />
                  <Detail label="Actor" value={selectedActivity.actor} />
                  <Detail label="Status" value={selectedActivity.status} />
                  <Detail label="Date" value={new Date(selectedActivity.createdAt).toLocaleString()} />
                </div>
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

  // ════════════════════════════════════════════════════════════════════════
  // Enhanced — tenant-experience layout
  // ════════════════════════════════════════════════════════════════════════

  const hasLogo = Boolean(brand?.logoUrl);
  const brandName = brand?.name ?? "ActivationIQ";

  return (
    <div className="min-h-screen bg-background font-sans">

      {/* ══ Sticky header ══ */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-primary text-primary-foreground shadow-sm">
        <div className="mx-auto flex max-w-7xl w-full items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className={cn(
              "grid size-14 shrink-0 place-items-center overflow-hidden",
              hasLogo ? "bg-white/20 p-1 ring-1 ring-white/30" : "bg-white/15 ring-1 ring-white/20"
            )}>
              {hasLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={brand!.logoUrl!} alt={brandName} className="h-full w-full object-contain" />
              ) : (
                <span className="text-xs font-bold text-white">{brandName.charAt(0).toUpperCase()}</span>
              )}
            </span>
            <div>
              <p className="text-sm font-semibold leading-none text-white">{brandName}</p>
              <p className="mt-0.5 text-[11px] text-white/60">Campaign Report</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" className="hidden rounded bg-white/10 text-white hover:bg-white/20 sm:flex gap-1.5" onClick={exportRawDataCsv}>
              <Download className="" />Export Data
            </Button>
            <Button variant="ghost" className="rounded bg-white/10 text-white hover:bg-white/20" onClick={toggleTheme}>
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />} Toggle theme
            </Button>
          </div>
        </div>
      </header>

      {/* ══ Hero — brand color background ══ */}
      <div className="bg-primary text-primary-foreground">
        <section className="mx-auto max-w-7xl w-full px-4 pb-8 pt-6 sm:px-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            {(campaign.start_date || campaign.end_date) ? (
              <span className="text-xs tabular-nums text-white/60">
                {campaign.start_date ?? "?"} → {campaign.end_date ?? "Ongoing"}
              </span>
            ) : null}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{campaign.name}</h1>
          {campaign.description ? (
            <p className="mt-2 max-w-2xl text-sm/relaxed text-white/70">{campaign.description}</p>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-2">
            {(campaign.state || campaign.lga) ? (
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs text-white/75">
                {[campaign.lga, campaign.state].filter(Boolean).join(", ")}
              </span>
            ) : null}
            <QuickKpi label="submissions" value={summary.totalSubmissions} />
            <QuickKpi label="conversions" value={summary.conversions} highlight />
            <QuickKpi label="outlets" value={summary.uniqueOutlets} />
            <QuickKpi label="areas" value={summary.areasCovered} />
            {(summary.salesCount ?? 0) > 0 ? <QuickKpi label="sales" value={summary.salesCount ?? 0} /> : null}
          </div>
        </section>
      </div>

      {/* ════════════════════════════════════════════════════════
          Body — background color
      ════════════════════════════════════════════════════════ */}
      <div className="mx-auto max-w-7xl px-4 pb-16 pt-5 sm:px-6">

        {/* ── Date + area filters ── */}
        <section className="flex flex-col gap-3  sm:flex-row sm:items-center">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className={cn(
                  "h-11 w-full justify-start bg-background text-left font-normal sm:w-[300px]",
                  !dateFrom && !dateTo && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className="truncate">{dateRangeLabel}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[320px] p-3" align="start">
              <DateRangeCalendar
                dateFrom={dateFrom}
                dateTo={dateTo}
                onChange={({ from, to }) => {
                  setDateFrom(from);
                  setDateTo(to);
                  setPage(1);
                }}
              />
            </PopoverContent>
          </Popover>

          <Select value={areaFilter} onValueChange={(v) => { setAreaFilter(v); setPage(1); }}>
            <SelectTrigger className="h-11 w-full bg-background sm:w-[190px]">
              <div className="flex min-w-0 items-center gap-2">
                <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                <SelectValue placeholder="All areas" />
              </div>
            </SelectTrigger>
            <SelectContent>
              {areaOptions.map((opt) => (
                <SelectItem key={opt} value={opt}>{opt === "all" ? "All areas" : opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {(dateFrom || dateTo || areaFilter !== "all") && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-0 h-9 gap-1 text-muted-foreground hover:text-foreground sm:ml-auto"
              onClick={() => { setDateFrom(""); setDateTo(""); setAreaFilter("all"); setPage(1); }}
            >
              <X className="h-4 w-4" />
              Reset
            </Button>
          )}
        </section>

        {/* ── KPI stats ── */}
        <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Total submissions" value={String(summary.totalSubmissions)} trend={summary.recentTrend} dataKey="submissions" />
          <StatCard label="Unique outlets" value={String(summary.uniqueOutlets)} trend={summary.recentTrend} dataKey="submissions" />
          <StatCard label="Conversions" value={String(summary.conversions)} trend={summary.recentTrend} dataKey="conversions" highlight />
          <StatCard label="Conv. rate" value={`${summary.conversionRate.toFixed(1)}%`} trend={summary.recentTrend} dataKey="conversions" highlight />
          <StatCard label="Areas covered" value={String(summary.areasCovered)} trend={summary.recentTrend} dataKey="submissions" />
          <StatCard label="Sync health" value={`${summary.syncHealth.toFixed(1)}%`} trend={summary.recentTrend} dataKey="submissions" />
          <StatCard label="Sales" value={String(summary.salesCount ?? 0)} trend={summary.recentTrend} dataKey="conversions" />
          {summary.posmDeployed > 0 ? (
            <StatCard label="POSM deployed" value={String(summary.posmDeployed)} trend={summary.recentTrend} dataKey="submissions" />
          ) : (
            <StatCard label="Units sold" value={String(summary.unitsSold ?? 0)} trend={summary.recentTrend} dataKey="conversions" />
          )}
        </section>

        {/* ── Custom tab bar ── */}
        <div className="mt-6">
          <div className="flex border-b-2 border-border">
            {([ ["map", "Coverage Map"], ["data", "Data Table"], ["media", "Media Gallery"] ] as [TabId, string][]).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => goToTab(id)}
                className={cn(
                  "relative -mb-0.5 px-5 py-3 text-xs font-semibold uppercase tracking-widest transition-colors",
                  activeTab === id
                    ? "border-b-2 border-primary text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="relative mt-5">

          {/* ── Coverage Map ── */}
          {activeTab === "map" ? (
            <div>
              <div className="relative">
                <CampaignPointMap points={mapPoints} resizeTrigger={mapTabActivations} />
                {loadingSections && mapPoints.length > 0 ? (
                  <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-3xl bg-background/30 backdrop-blur-[1px]">
                    <span className="rounded-full border border-border bg-background/90 px-3 py-1 text-xs text-muted-foreground">Refreshing map…</span>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* ── Data Table tab ── */}
          {activeTab === "data" && (
            <div className="mt-5 space-y-4">
              {/* Filter bar */}
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2.5">
                <div className="relative min-w-[180px] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-9 rounded-xl border-0 bg-background pl-9 text-sm shadow-none focus-visible:ring-1"
                    placeholder="Search customer, outlet, actor…"
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  />
                </div>
                <Select value={actorFilter} onValueChange={(v) => { setActorFilter(v); setPage(1); }}>
                  <SelectTrigger className="h-9 w-auto min-w-[130px] rounded-xl text-sm">
                    <SelectValue placeholder="All actors" />
                  </SelectTrigger>
                  <SelectContent>
                    {actorOptions.map((opt) => <SelectItem key={opt} value={opt}>{opt === "all" ? "All actors" : opt}</SelectItem>)}
                  </SelectContent>
                </Select>
                <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                  {activitiesTotal} result{activitiesTotal !== 1 ? "s" : ""}
                </span>
              </div>

              <div className="overflow-hidden rounded-2xl border border-border">
                <div className="overflow-x-auto">
                  <table className="min-w-[800px] w-full text-sm">
                    <thead className="border-b border-border bg-muted/30">
                      <tr>
                        {["Customer", "Outlet", "Area", "Products", "Actor", "Status", "Date", ""].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {loadingSections && filteredActivities.length === 0 ? (
                        Array.from({ length: 5 }).map((_, i) => (
                          <tr key={i}><td colSpan={8} className="px-4 py-4"><div className="h-4 animate-pulse rounded-full bg-muted/60" /></td></tr>
                        ))
                      ) : filteredActivities.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-4 py-16 text-center">
                            <div className="flex flex-col items-center gap-2.5">
                              <div className="grid size-12 place-items-center rounded-2xl bg-muted/50">
                                <Search className="size-5 text-muted-foreground/40" />
                              </div>
                              <p className="text-sm text-muted-foreground">No activity matches your filters.</p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        filteredActivities.map((item) => (
                          <tr
                            key={item.id}
                            onClick={() => setSelectedActivity(item)}
                            className={cn(
                              "cursor-pointer transition-colors hover:bg-primary/5",
                              item.status === "converted" && "bg-emerald-500/[0.04]"
                            )}
                          >
                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-2">
                                <span className={cn(
                                  "size-1.5 shrink-0 rounded-full",
                                  item.status === "converted" ? "bg-emerald-500" :
                                  item.status === "revisit"   ? "bg-violet-500"  :
                                  item.status === "pending"   ? "bg-amber-400"   :
                                  "bg-muted-foreground/30"
                                )} />
                                <span className="text-muted-foreground">{item.customer ?? "-"}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3.5 font-medium">{item.outlet}</td>
                            <td className="px-4 py-3.5 text-muted-foreground">{item.area ?? "-"}</td>
                            <td className="px-4 py-3.5 text-muted-foreground">{item.products ?? "-"}</td>
                            <td className="px-4 py-3.5">{item.actor}</td>
                            <td className="px-4 py-3.5">
                              <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize", activityBadgeClass(item.status))}>
                                {item.status}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</td>
                            <td className="px-4 py-3.5 text-right">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setSelectedActivity(item); }}
                                className="rounded-full px-2.5 py-1 text-xs transition bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary"
                              >
                                View
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <p>
                  {`Showing ${filteredActivities.length === 0 ? 0 : (pageSafe - 1) * PAGE_SIZE + 1}–${(pageSafe - 1) * PAGE_SIZE + filteredActivities.length} of ${activitiesTotal}`}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="rounded-full" disabled={pageSafe <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</Button>
                  <Button variant="outline" size="sm" className="rounded-full" disabled={pageSafe >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</Button>
                </div>
              </div>
            </div>
          )}

          {/* ── Media Gallery tab ── */}
          {activeTab === "media" && (
            <div className="mt-5">
              <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-semibold">
                    {evidence.length > 0
                      ? `${evidencePagination.total} photo${evidencePagination.total !== 1 ? "s" : ""}`
                      : "Photos"}
                  </h3>
                  {evidencePagination.total > evidence.length ? (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      {evidencePagination.total - evidence.length} more
                    </span>
                  ) : null}
                </div>

                {evidence.length === 0 && !loadingSections ? (
                  <div className="flex h-52 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border">
                    <div className="grid size-12 place-items-center rounded-2xl bg-muted/50">
                      <ImageIcon className="size-5 text-muted-foreground/40" />
                    </div>
                    <p className="text-sm text-muted-foreground">No photos uploaded yet.</p>
                  </div>
                ) : loadingSections && evidence.length === 0 ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="aspect-square animate-pulse rounded-2xl bg-muted/50" />
                    ))}
                  </div>
                ) : (
                  <>
                    {/* Group by visit */}
                    {Array.from(evidenceByVisit.entries()).map(([visitId, photos]) => {
                      const visitActivity = activities.find((a) => {
                        const vid = a.id.startsWith("visit-") ? a.id.replace("visit-", "") : a.id;
                        return vid === visitId;
                      });
                      const firstPhoto = photos[0];
                      return (
                        <div key={visitId} className="space-y-3">
                          {/* Visit section header */}
                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                            {visitActivity ? (
                              <>
                                <span className="font-medium text-foreground">{visitActivity.actor}</span>
                                <span>·</span>
                                <span>{visitActivity.outlet}</span>
                                {visitActivity.area ? <><span>·</span><span>{visitActivity.area}</span></> : null}
                              </>
                            ) : null}
                            {firstPhoto?.created_at ? (
                              <>
                                {visitActivity ? <span>·</span> : null}
                                <span>{new Date(firstPhoto.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
                              </>
                            ) : null}
                            <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">
                              {photos.length} photo{photos.length !== 1 ? "s" : ""}
                            </span>
                          </div>

                          {/* Photo grid */}
                          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
                            {photos.map((photo) => (
                              <button
                                key={photo.id}
                                type="button"
                                disabled={!photo.signed_url}
                                onClick={() => photo.signed_url && setLightboxPhoto(photo)}
                                className="group relative aspect-square overflow-hidden rounded-2xl border border-border bg-muted/40 transition hover:ring-2 hover:ring-primary disabled:opacity-50"
                              >
                                {photo.signed_url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={photo.signed_url}
                                    alt=""
                                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                  />
                                ) : (
                                  <div className="grid h-full place-items-center">
                                    <ImageIcon className="size-6 text-muted-foreground/30" />
                                  </div>
                                )}
                                {/* Hover overlay */}
                                <div className="pointer-events-none absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/60 via-black/0 to-transparent p-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                                  {photo.created_at ? (
                                    <p className="text-[10px] font-medium text-white/80">
                                      {new Date(photo.created_at).toLocaleDateString()}
                                    </p>
                                  ) : null}
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}

                    {/* Load more */}
                    {evidencePagination.hasMore ? (
                      <Button variant="outline" className="w-full rounded-full" disabled={loadingMoreEvidence} onClick={loadMoreEvidence}>
                        {loadingMoreEvidence
                          ? "Loading…"
                          : `Load more · ${evidencePagination.total - evidence.length} remaining`}
                      </Button>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          )}

          </div>{/* closes relative mt-5 tab-content wrapper */}
        </div>{/* closes mt-6 tab container */}

        <footer className="mt-12 text-center text-xs text-muted-foreground">
          Powered by ActivationIQ · Read-only view
        </footer>
      </div>

      {/* ── Photo lightbox ── */}
      <Dialog open={Boolean(lightboxPhoto)} onOpenChange={(open) => !open && setLightboxPhoto(null)}>
        <DialogContent className="max-w-3xl gap-0 overflow-hidden p-0">
          <div className="aspect-video w-full bg-black">
            {lightboxPhoto?.signed_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={lightboxPhoto.signed_url}
                alt="Evidence preview"
                className="h-full w-full object-contain"
              />
            ) : null}
          </div>
          {lightboxPhoto?.created_at ? (
            <div className="flex items-center justify-between border-t border-border px-5 py-3">
              <p className="text-xs text-muted-foreground">
                {new Date(lightboxPhoto.created_at).toLocaleString()}
              </p>
              {lightboxPhoto.signed_url ? (
                <a
                  href={lightboxPhoto.signed_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Open full size
                </a>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ── Activity detail sheet ── */}
      <Sheet open={Boolean(selectedActivity)} onOpenChange={(open) => !open && setSelectedActivity(null)}>
        <SheetContent side="right" className="flex w-full flex-col overflow-y-auto max-w-4xl!">
          <SheetHeader className="pb-4">
            <SheetTitle>Activity Details</SheetTitle>
            {selectedActivity ? (
              <SheetDescription>
                {selectedActivity.outlet}
                {selectedActivity.area ? ` · ${selectedActivity.area}` : ""}
                {" · "}
                {new Date(selectedActivity.createdAt).toLocaleString()}
              </SheetDescription>
            ) : null}
          </SheetHeader>

          {selectedActivity ? (
            <div className="flex-1 space-y-4 text-sm">
              {/* Status badge */}
              <div className="flex flex-wrap gap-2">
                <span className={cn("inline-flex rounded-full px-3 py-1 text-xs font-medium capitalize", activityBadgeClass(selectedActivity.status))}>
                  {selectedActivity.status}
                </span>
                {selectedActivity.taskType ? (
                  <span className="inline-flex rounded-full bg-muted px-3 py-1 text-xs capitalize">
                    {selectedActivity.taskType.replaceAll("_", " ")}
                  </span>
                ) : null}
              </div>

              {/* Core fields */}
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ["Customer",  selectedActivity.customer ?? "-"],
                    ["Outlet",    selectedActivity.outlet],
                    ["Area",      selectedActivity.area ?? "-"],
                    ["Products",  selectedActivity.products ?? "-"],
                    ["Location",  selectedActivity.location ?? "-"],
                    ["Actor",     selectedActivity.actor],
                    ["Status",    selectedActivity.status],
                    ["Date",      new Date(selectedActivity.createdAt).toLocaleString()],
                  ] as [string, string][]
                ).map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-muted/40 px-3 py-2.5">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="mt-0.5 font-medium">{value}</p>
                  </div>
                ))}
              </div>

              {/* Form payload details */}
              {selectedDetails.length > 0 ? (
                <div className="rounded-xl border border-border bg-muted/20 p-3">
                  <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Form details</p>
                  <div className="space-y-1.5">
                    {selectedDetails.map((row, i) => (
                      <div key={i} className="rounded-lg bg-background px-3 py-2">
                        <p className="text-xs text-muted-foreground">{row.label}</p>
                        <p className="text-sm font-medium">{row.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Sales lines */}
              {(selectedActivity.saleLines ?? []).length > 0 ? (
                <div className="rounded-xl border border-border bg-muted/20 p-3">
                  <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Sales lines · {selectedActivity.saleLines!.length}
                  </p>
                  <div className="space-y-1.5">
                    {(selectedActivity.saleLines ?? []).map((line) => (
                      <div key={line.id} className="flex items-center justify-between rounded-lg bg-background px-3 py-2 text-sm">
                        <p className="font-medium">{line.product_name ?? "Unnamed"}</p>
                        <p className="text-xs text-muted-foreground">Qty {line.quantity ?? 0}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ── Hero quick-stat pill ──────────────────────────────────────────────────────

function QuickKpi({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={cn(
      "rounded-full px-4 py-1.5 text-xs",
      highlight ? "bg-white/20 font-semibold text-white" : "bg-white/10 text-white/80"
    )}>
      <span className="font-semibold">{value.toLocaleString()}</span>{" "}
      <span className="opacity-75">{label}</span>
    </div>
  );
}

// ── Classic stat card with area-chart trend ────────────────────────────────────

function Stat({
  label,
  value,
  trend,
  dataKey,
}: {
  label: string;
  value: string;
  trend: Array<{ day: string; submissions: number; conversions: number }>;
  dataKey: "submissions" | "conversions";
}) {
  const normalizedTrend = useMemo(() => {
    if (!trend || trend.length === 0) {
      return [
        { day: "Start", submissions: 0, conversions: 0 },
        { day: "Now", submissions: 0, conversions: 0 },
      ];
    }
    if (trend.length === 1) {
      const only = trend[0];
      return [
        { day: "Prev", submissions: 0, conversions: 0 },
        only,
      ];
    }
    return trend;
  }, [trend]);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      <div className="mt-3 h-12">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={normalizedTrend}>
            <RechartsTooltip
              cursor={false}
              contentStyle={{ borderRadius: 10, borderColor: "var(--border)", background: "var(--card)" }}
              labelStyle={{ color: "var(--muted-foreground)" }}
            />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke="var(--color-chart-1)"
              strokeWidth={2}
              fill="var(--color-chart-1)"
              fillOpacity={0.16}
              dot={false}
              activeDot={{ r: 3 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/30 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

// ── Enhanced stat card with bar-chart sparkline ─────────────────────────────────

function StatCard({
  label, value, trend, dataKey, highlight = false,
}: {
  label: string; value: string;
  trend: Array<{ day: string; submissions: number; conversions: number }>;
  dataKey: "submissions" | "conversions";
  highlight?: boolean;
}) {
  const normalizedTrend = useMemo(() => {
    if (!trend?.length) return [{ day: "S", submissions: 0, conversions: 0 }, { day: "N", submissions: 0, conversions: 0 }];
    if (trend.length === 1) return [{ day: "P", submissions: 0, conversions: 0 }, trend[0]];
    return trend;
  }, [trend]);

  return (
    <div className={cn(
      "rounded-xl border p-4 flex flex-col justify-between min-h-[110px]",
      highlight ? "border-primary/20 bg-primary/5" : "border-border bg-card"
    )}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
        </div>
      </div>

      {/* Tighter, modern micro-bar chart */}
      <div className="h-7 w-full mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={normalizedTrend} barGap={2}>
            <RechartsTooltip
              cursor={{ fill: 'var(--muted)', opacity: 0.1 }}
              contentStyle={{ borderRadius: 6, borderColor: "var(--border)", background: "var(--card)", fontSize: 10 }}
            />
            <Bar
              dataKey={dataKey}
              radius={[2, 2, 0, 0]}
              fill={highlight ? "var(--primary)" : "var(--color-chart-1, #3b82f6)"}
              maxBarSize={8}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
