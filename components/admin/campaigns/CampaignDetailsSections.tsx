"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { More02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft, BarChart3, Download, ImageIcon, LayoutList, MapIcon, Pencil, Rocket, Share2, Trash2, Users } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import CampaignPointMap from "@/components/campaign/CampaignPointMap";
import EvidenceGallery from "@/components/shared/EvidenceGallery";
import { useUiVariant } from "@/components/providers/tenant-experience-provider";
import { cn } from "@/lib/utils";
import type { CampaignAnalyticsSummary, CampaignEvidenceItem, CampaignEvidencePagination, CampaignMapPoint } from "@/types/campaign-intelligence";

type Campaign = {
  id: string;
  name: string;
  campaign_type: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  status: "draft" | "active" | "completed";
  state: string | null;
  lga: string | null;
  target_outlets: number | null;
  target_conversions: number | null;
  expected_reps: number | null;
  outlet_types: string[];
  products: Array<{ sku?: string; name?: string; price?: number | null }>;
  form_requirements: Record<string, boolean>;
  runtime_form_config?: Record<string, unknown>;
  campaign_tasks?: string[];
};

type AssignedRepRow = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  status: string;
};

type SupervisorRow = {
  id: string;
  userId: string;
  name: string;
  email: string;
  status: string;
};

type CampaignActivity = {
  id: string;
  type: "visit" | "sale";
  taskType?: string;
  status: string;
  customer?: string;
  outletPhone?: string;
  outlet: string;
  area?: string;
  products?: string;
  location?: string;
  actor: string;
  createdAt: string;
  saleCount?: number;
};

type CampaignDetailsSectionsProps = {
  campaign: Campaign;
  summary: CampaignAnalyticsSummary | null;
  mapPoints: CampaignMapPoint[];
  supervisorNames: string;
  supervisorRows: SupervisorRow[];
  assignedRepRows: AssignedRepRow[];
  evidence: CampaignEvidenceItem[];
  evidencePagination: CampaignEvidencePagination;
  loadingMoreEvidence: boolean;
  deletingEvidenceId: string | null;
  onDeleteEvidence: (evidenceId: string) => void;
  onLoadMoreEvidence: () => void;
  exportingActivities: boolean;
  launching: boolean;
  deletingCampaign: boolean;
  onExportActivities: () => void;
  onLaunchCampaign: () => void;
  onDeleteCampaign: () => void;
  onOpenShareDialog: () => void;
  onOpenAssignDialog: () => void;
  activitySearch: string;
  onActivitySearchChange: (value: string) => void;
  activityStatusFilter: string;
  onActivityStatusFilterChange: (value: string) => void;
  dateFrom: string;
  onDateFromChange: (value: string) => void;
  dateTo: string;
  onDateToChange: (value: string) => void;
  onClearDateFilter: () => void;
  onApplyFilters: () => void;
  activities: CampaignActivity[];
  activityPage: number;
  activitiesTotal: number;
  onPreviousPage: () => void;
  onNextPage: () => void;
};

type TabId = "overview" | "analytics" | "activities" | "evidence";

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "overview",   label: "Overview",   icon: LayoutList  },
  { id: "analytics",  label: "Analytics",  icon: BarChart3   },
  { id: "activities", label: "Activities", icon: MapIcon     },
  { id: "evidence",   label: "Evidence",   icon: ImageIcon   },
];

export function CampaignDetailsSections({
  campaign,
  summary,
  mapPoints,
  supervisorNames,
  supervisorRows,
  assignedRepRows,
  evidence,
  evidencePagination,
  loadingMoreEvidence,
  deletingEvidenceId,
  onDeleteEvidence,
  onLoadMoreEvidence,
  exportingActivities,
  launching,
  deletingCampaign,
  onExportActivities,
  onLaunchCampaign,
  onDeleteCampaign,
  onOpenShareDialog,
  onOpenAssignDialog,
  activitySearch,
  onActivitySearchChange,
  activityStatusFilter,
  onActivityStatusFilterChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  onClearDateFilter,
  onApplyFilters,
  activities,
  activityPage,
  activitiesTotal,
  onPreviousPage,
  onNextPage,
}: CampaignDetailsSectionsProps) {
  const uiVariant = useUiVariant();
  const isEnhanced = uiVariant === "enhanced";

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [mapActivations, setMapActivations] = useState(0);

  const posmConfigured =
    Boolean(campaign.form_requirements?.requirePosmDeployment) ||
    (campaign.campaign_tasks ?? []).includes("posm_deployment");
  const freeSampleConfig = (
    (campaign.runtime_form_config as { tasks?: Record<string, Record<string, unknown>> } | null)?.tasks
    ?.free_sample_distribution ?? {}
  ) as Record<string, unknown>;
  const freeSampleEnabled = Boolean(freeSampleConfig.enabled);

  function goToTab(tab: TabId) {
    setActiveTab(tab);
    if (tab === "overview") setMapActivations((n) => n + 1);
  }

  // ── Shared pieces ──────────────────────────────────────────────────────────

  const backBtn = (
    <Button variant="outline" className="rounded-full" asChild>
      <Link href="/admin/campaigns" className="inline-flex items-center gap-2">
        <ArrowLeft className="size-4" />Back
      </Link>
    </Button>
  );

  const campaignHeader = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="mb-3 flex items-center gap-2">
          <Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/10 capitalize">{campaign.status}</Badge>
          <span className="text-sm text-muted-foreground">{campaign.start_date ?? "-"} – {campaign.end_date ?? "-"}</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">{campaign.name}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{campaign.description || "No campaign description yet."}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button className="rounded-full px-5" asChild>
          <Link href={`/admin/campaigns/${campaign.id}/edit`} className="inline-flex items-center gap-2">
            <Pencil className="size-4" />Edit
          </Link>
        </Button>
        {campaign.status === "draft" ? (
          <Button className="rounded-full px-5" disabled={launching} onClick={onLaunchCampaign}>
            <span className="inline-flex items-center gap-2">
              <Rocket className="size-4" />{launching ? "Launching…" : "Go Live"}
            </span>
          </Button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="rounded-full px-4">
              <span className="inline-flex items-center gap-2">
                <HugeiconsIcon icon={More02Icon} className="size-4" />More
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem asChild>
              <Link href={`/admin/reports/performance?campaignId=${campaign.id}`}>Open KPI Performance</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={exportingActivities} onClick={onExportActivities}>
              <Download className="size-4" />{exportingActivities ? "Exporting…" : "Export Activities"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenShareDialog}>
              <Share2 className="size-4" />Share Campaign
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" disabled={deletingCampaign} onClick={() => setDeleteOpen(true)}>
              <Trash2 className="size-4" />{deletingCampaign ? "Deleting…" : "Delete Campaign"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  const deleteDialog = (
    <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Campaign?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete this campaign and related submissions, outlets, assignments, share links, and evidence references.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deletingCampaign}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => void onDeleteCampaign()}
            disabled={deletingCampaign}
          >
            {deletingCampaign ? "Deleting…" : "Delete Campaign"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  // ── Reusable content blocks (shared between classic and enhanced) ──────────

  const kpiCards = (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
      <KpiCard label="Total submissions"  value={String(summary?.totalSubmissions ?? 0)}                        trend={summary?.recentTrend} dataKey="submissions" />
      <KpiCard label="Unique outlets"     value={String(summary?.uniqueOutlets ?? 0)}                           trend={summary?.recentTrend} dataKey="submissions" />
      <KpiCard label="Areas covered"      value={String(summary?.areasCovered ?? 0)}                            trend={summary?.recentTrend} dataKey="submissions" />
      <KpiCard label="Conversions"        value={String(summary?.conversions ?? 0)}                             trend={summary?.recentTrend} dataKey="conversions" highlight />
      <KpiCard label="Conversion rate"    value={`${(summary?.conversionRate ?? 0).toFixed(1)}%`}               trend={summary?.recentTrend} dataKey="conversions" highlight />
      <KpiCard label="Sync health"        value={`${(summary?.syncHealth ?? 0).toFixed(1)}%`}                   trend={summary?.recentTrend} dataKey="submissions" />
      {posmConfigured ? (
        <KpiCard label="POSM deployed" value={`${summary?.posmDeployed ?? 0} (${summary?.posmUnits ?? 0} units)`} trend={summary?.recentTrend} dataKey="submissions" />
      ) : null}
    </section>
  );

  const achievementCards = (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <AchievementCard label="Visit achievement"      achieved={summary?.achievedVisits ?? 0}        target={campaign.target_outlets ?? 0} />
      <AchievementCard label="Conversion achievement" achieved={summary?.convertedOutlets ?? 0}      target={campaign.target_conversions ?? 0} />
      {freeSampleEnabled ? <AchievementCard label="Free samples distributed" achieved={summary?.distributedFreeSamples ?? 0} target={summary?.plannedFreeSamples ?? 0} /> : null}
      {freeSampleEnabled ? <KpiCard label="Free samples remaining" value={String(summary?.remainingFreeSamples ?? 0)} trend={summary?.recentTrend} dataKey="submissions" /> : null}
    </section>
  );

  const mapSection = (
    <section className="rounded-3xl border border-border bg-card p-5">
      <h2 className="font-semibold">Coverage Map</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">Plotted coordinates from visits and sales records.</p>
      <div className="mt-4">
        <CampaignPointMap points={mapPoints} resizeTrigger={mapActivations} />
      </div>
    </section>
  );

  const overviewGrid = (
    <section className="rounded-3xl border border-border bg-card p-5">
      <h2 className="font-semibold">Campaign Overview</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Info2 label="Campaign type"         value={campaign.campaign_type || "-"} />
        <Info2 label="Tasks"                 value={(campaign.campaign_tasks ?? []).length ? (campaign.campaign_tasks ?? []).join(", ") : "-"} />
        <Info2 label="Territory"             value={[campaign.state, campaign.lga].filter(Boolean).join(" / ") || "-"} />
        <Info2 label="Assigned supervisors"  value={supervisorRows.length > 1 ? `${supervisorRows.length} supervisors` : supervisorNames} />
        <Info2 label="Target outlets"        value={campaign.target_outlets?.toLocaleString() ?? "-"} />
        <Info2 label="Target conversions"    value={campaign.target_conversions?.toLocaleString() ?? "-"} />
        <Info2 label="Expected reps"         value={campaign.expected_reps?.toLocaleString() ?? "-"} />
      </div>
      {supervisorRows.length > 1 ? (
        <div className="mt-4 overflow-hidden rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Supervisor</th>
                <th className="px-4 py-3 text-left font-medium">Email</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {supervisorRows.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="px-4 py-3.5 font-medium">{row.name}</td>
                  <td className="px-4 py-3.5 text-muted-foreground">{row.email}</td>
                  <td className="px-4 py-3.5"><Badge className={`rounded-full text-xs ${statusBadgeClass(row.status)}`}>{row.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );

  const repsSection = (
    <section className="rounded-3xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Assigned Reps</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Campaign field agents with role and status.</p>
        </div>
        <Button variant="outline" className="rounded-full" onClick={onOpenAssignDialog}>
          <span className="inline-flex items-center gap-2"><Users className="size-4" />Assign</span>
        </Button>
      </div>
      <div className="mt-4 overflow-hidden rounded-2xl border border-border">
        <div className="overflow-x-auto">
          <table className="min-w-[540px] w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Rep</th>
                <th className="px-4 py-3 text-left font-medium">Email</th>
                <th className="px-4 py-3 text-left font-medium">Role</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {assignedRepRows.length === 0 ? (
                <tr className="border-t border-border">
                  <td className="px-4 py-6 text-muted-foreground" colSpan={4}>No reps assigned yet.</td>
                </tr>
              ) : (
                assignedRepRows.map((row) => (
                  <tr key={row.id} className="border-t border-border hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3.5 font-medium">{row.name}</td>
                    <td className="px-4 py-3.5 text-muted-foreground">{row.email}</td>
                    <td className="px-4 py-3.5 capitalize">{String(row.role).replace("_", " ")}</td>
                    <td className="px-4 py-3.5"><Badge className={`rounded-full text-xs ${statusBadgeClass(row.status)}`}>{row.status}</Badge></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );

  const productsSection = (
    <section className="rounded-3xl border border-border bg-card p-5">
      <h2 className="font-semibold">Products / SKUs</h2>
      <div className="mt-3 space-y-1.5">
        {(campaign.products ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No products configured.</p>
        ) : (
          (campaign.products ?? []).map((product, index) => (
            <div key={`${product.sku ?? "sku"}-${index}`} className="flex items-center gap-3 rounded-xl bg-muted/40 px-3 py-2.5">
              <span className="text-sm font-medium">{product.name ?? product.sku ?? "Unnamed product"}</span>
              {product.sku ? <span className="text-xs text-muted-foreground font-mono">{product.sku}</span> : null}
              {product.price != null ? <span className="ml-auto text-xs text-muted-foreground">{product.price.toLocaleString()}</span> : null}
            </div>
          ))
        )}
      </div>
    </section>
  );

  const formRequirementsSection = (
    <section className="rounded-3xl border border-border bg-card p-5 overflow-x-auto overflow-clip">
      <h2 className="font-semibold">Form Requirements</h2>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {Object.entries(campaign.form_requirements ?? {}).length === 0 ? (
          <p className="text-sm text-muted-foreground">No form rules configured.</p>
        ) : (
          Object.entries(campaign.form_requirements ?? {}).map(([key, enabled]) => (
            <div key={key} className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2.5">
              <span className="text-sm">{key}</span>
              <Badge className={`rounded-full text-xs ${enabled ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
                {enabled ? "Required" : "Optional"}
              </Badge>
            </div>
          ))
        )}
      </div>
    </section>
  );

  const activitiesSection = (
    <section className="rounded-3xl border border-border bg-card p-5">
      <h2 className="font-semibold">Campaign Activities</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">Latest visit events grouped with related sales lines.</p>

      {/* Filters */}
      <div className="mt-4 space-y-3">
        <div className="grid gap-2 sm:grid-cols-3">
          <input type="date" className="h-10 rounded-xl border border-border bg-background px-4 text-sm" value={dateFrom} onChange={(e) => onDateFromChange(e.target.value)} />
          <input type="date" className="h-10 rounded-xl border border-border bg-background px-4 text-sm" value={dateTo} onChange={(e) => onDateToChange(e.target.value)} />
          <Button variant="outline" className="h-10 rounded-xl" onClick={onClearDateFilter}>Clear dates</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <input className="h-10 flex-1 rounded-xl border border-border bg-background px-4 text-sm" placeholder="Search outlet / actor / status" value={activitySearch} onChange={(e) => onActivitySearchChange(e.target.value)} />
          <Select value={activityStatusFilter} onValueChange={onActivityStatusFilterChange}>
            <SelectTrigger className="w-40 rounded-xl"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="converted">Converted</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="revisit">Revisit</SelectItem>
              <SelectItem value="no_sale">No sale</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="rounded-xl" onClick={onApplyFilters}>Apply</Button>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-border">
        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                {["Activity", "Customer", "Phone", "Outlet", "Area", "Products", "Location", "Actor", "Status", "Date", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activities.length === 0 ? (
                <tr className="border-t border-border">
                  <td className="px-4 py-8 text-muted-foreground" colSpan={11}>No activities yet for this campaign.</td>
                </tr>
              ) : (
                activities.map((item) => (
                  <tr key={item.id} className="border-t border-border hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3.5 capitalize">{item.taskType ?? (item.type === "visit" ? "visit" : "sale")}</td>
                    <td className="px-4 py-3.5">{item.customer ?? "-"}</td>
                    <td className="px-4 py-3.5 text-muted-foreground">{item.outletPhone ?? "N/A"}</td>
                    <td className="px-4 py-3.5 font-medium">{item.outlet}</td>
                    <td className="px-4 py-3.5">{item.area ?? "-"}</td>
                    <td className="px-4 py-3.5 text-muted-foreground">{item.products ?? "-"}</td>
                    <td className="px-4 py-3.5 text-muted-foreground">{item.location ?? "-"}</td>
                    <td className="px-4 py-3.5">{item.actor}</td>
                    <td className="px-4 py-3.5">
                      <Badge className={`rounded-full capitalize text-xs ${activityStatusBadgeClass(item.status)}`}>{item.status}</Badge>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3.5 text-right">
                      <Link href={`/admin/campaigns/${campaign.id}/activities/${item.id}`} className="text-xs text-primary hover:underline">View</Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
        <p>Showing {activities.length === 0 ? 0 : (activityPage - 1) * 20 + 1}–{(activityPage - 1) * 20 + activities.length} of {activitiesTotal}</p>
        <div className="flex gap-2">
          <Button variant="outline" className="rounded-full" disabled={activityPage <= 1} onClick={onPreviousPage}>Previous</Button>
          <Button variant="outline" className="rounded-full" disabled={activityPage * 20 >= activitiesTotal} onClick={onNextPage}>Next</Button>
        </div>
      </div>
    </section>
  );

  const evidenceSection = (
    <section className="rounded-3xl border border-border bg-card p-5">
      <h2 className="font-semibold">Photo Evidence</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">All uploaded campaign evidence with signed preview links.</p>
      <div className="mt-4">
        <EvidenceGallery evidence={evidence} onDelete={onDeleteEvidence} deletingId={deletingEvidenceId} />
      </div>
      {evidencePagination.hasMore ? (
        <div className="mt-3">
          <Button variant="outline" className="rounded-full" disabled={loadingMoreEvidence} onClick={onLoadMoreEvidence}>
            {loadingMoreEvidence
              ? "Loading…"
              : `Load more · ${evidencePagination.total - evidence.length} remaining`}
          </Button>
        </div>
      ) : null}
    </section>
  );

  // ── Enhanced layout (tabbed) ───────────────────────────────────────────────

  if (isEnhanced) {
    return (
      <>
        {backBtn}
        {campaignHeader}

        {/* Tab bar */}
        <div className="flex border-b border-border">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => goToTab(id)}
              className={cn(
                "relative -mb-px flex items-center gap-2 px-5 py-3 text-xs font-semibold uppercase tracking-widest transition-colors",
                activeTab === id
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="size-3.5" />
              {label}
              {id === "activities" && activitiesTotal > 0 ? (
                <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground tabular-nums">
                  {activitiesTotal}
                </span>
              ) : null}
              {id === "evidence" && evidence.length > 0 ? (
                <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground tabular-nums">
                  {evidence.length}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {/* Overview tab */}
        {activeTab === "overview" && (
          <div className="space-y-5">
            <div className="grid gap-5 lg:grid-cols-5">
              <div className="space-y-5 lg:col-span-3">
                {overviewGrid}
                {repsSection}
              </div>
              <div className="space-y-5 lg:col-span-2">
                {mapSection}
                {productsSection}
                {formRequirementsSection}
              </div>
            </div>
          </div>
        )}

        {/* Analytics tab */}
        {activeTab === "analytics" && (
          <div className="space-y-5">
            {kpiCards}
            <div className="flex items-center gap-3">
              <div className="flex-1 border-t border-border" />
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Target progress</span>
              <div className="flex-1 border-t border-border" />
            </div>
            {achievementCards}
          </div>
        )}

        {/* Activities tab */}
        {activeTab === "activities" && (
          <div className="space-y-5">
            {activitiesSection}
          </div>
        )}

        {/* Evidence tab */}
        {activeTab === "evidence" && (
          <div className="space-y-5">
            {evidenceSection}
          </div>
        )}

        {deleteDialog}
      </>
    );
  }

  // ── Classic layout (existing stacked — unchanged) ─────────────────────────

  return (
    <>
      {backBtn}
      {campaignHeader}

      {/* KPI sparkline cards */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <KpiCard label="Total submissions"  value={String(summary?.totalSubmissions ?? 0)}                  trend={summary?.recentTrend} dataKey="submissions" />
        <KpiCard label="Unique outlets"     value={String(summary?.uniqueOutlets ?? 0)}                     trend={summary?.recentTrend} dataKey="submissions" />
        <KpiCard label="Areas covered"      value={String(summary?.areasCovered ?? 0)}                      trend={summary?.recentTrend} dataKey="submissions" />
        <KpiCard label="Conversions"        value={String(summary?.conversions ?? 0)}                       trend={summary?.recentTrend} dataKey="conversions" highlight />
        <KpiCard label="Conversion rate"    value={`${(summary?.conversionRate ?? 0).toFixed(1)}%`}         trend={summary?.recentTrend} dataKey="conversions" highlight />
        <KpiCard label="Sync health"        value={`${(summary?.syncHealth ?? 0).toFixed(1)}%`}             trend={summary?.recentTrend} dataKey="submissions" />
        {posmConfigured ? <KpiCard label="POSM deployed" value={`${summary?.posmDeployed ?? 0} (${summary?.posmUnits ?? 0} units)`} trend={summary?.recentTrend} dataKey="submissions" /> : null}
      </section>

      {/* Achievement progress */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AchievementCard label="Visit achievement"      achieved={summary?.achievedVisits ?? 0}       target={campaign.target_outlets ?? 0} />
        <AchievementCard label="Conversion achievement" achieved={summary?.convertedOutlets ?? 0}     target={campaign.target_conversions ?? 0} />
        {freeSampleEnabled ? <AchievementCard label="Free samples distributed" achieved={summary?.distributedFreeSamples ?? 0} target={summary?.plannedFreeSamples ?? 0} /> : null}
        {freeSampleEnabled ? <KpiCard label="Free samples remaining" value={String(summary?.remainingFreeSamples ?? 0)} trend={summary?.recentTrend} dataKey="submissions" /> : null}
      </section>

      <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <h2 className="font-semibold">Campaign Coverage Map</h2>
        <p className="mt-1 text-sm text-muted-foreground">Plotted coordinates captured from visits and sales records.</p>
        <div className="mt-4"><CampaignPointMap points={mapPoints} /></div>
      </section>

      <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <h2 className="font-semibold">Campaign Overview</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Info2 label="Campaign type"        value={campaign.campaign_type || "-"} />
          <Info2 label="Tasks"                value={(campaign.campaign_tasks ?? []).length ? (campaign.campaign_tasks ?? []).join(", ") : "-"} />
          <Info2 label="Territory"            value={[campaign.state, campaign.lga].filter(Boolean).join(" / ") || "-"} />
          <Info2 label="Assigned supervisors" value={supervisorRows.length > 1 ? `${supervisorRows.length} supervisors` : supervisorNames} />
          <Info2 label="Target outlets"       value={campaign.target_outlets?.toLocaleString() ?? "-"} />
          <Info2 label="Target conversions"   value={campaign.target_conversions?.toLocaleString() ?? "-"} />
          <Info2 label="Expected reps"        value={campaign.expected_reps?.toLocaleString() ?? "-"} />
        </div>
        {supervisorRows.length > 1 ? (
          <div className="mt-4 overflow-hidden rounded-3xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Supervisor</th>
                  <th className="px-4 py-3 text-left font-medium">Email</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {supervisorRows.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="px-4 py-4 font-medium">{row.name}</td>
                    <td className="px-4 py-4 text-muted-foreground">{row.email}</td>
                    <td className="px-4 py-4"><Badge className={`rounded-full ${statusBadgeClass(row.status)}`}>{row.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60 lg:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">Assigned Reps</h2>
              <p className="mt-1 text-sm text-muted-foreground">Campaign field agents with role and status.</p>
            </div>
            <Button variant="outline" className="rounded-full" onClick={onOpenAssignDialog}>
              <span className="inline-flex items-center gap-2"><Users className="size-4" />Assign Supervisors & Reps</span>
            </Button>
          </div>
          <div className="mt-4 overflow-hidden rounded-3xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Rep</th>
                  <th className="px-4 py-3 text-left font-medium">Email</th>
                  <th className="px-4 py-3 text-left font-medium">Role</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {assignedRepRows.length === 0 ? (
                  <tr className="border-t border-border"><td className="px-4 py-6 text-muted-foreground" colSpan={4}>No reps assigned yet.</td></tr>
                ) : (
                  assignedRepRows.map((row) => (
                    <tr key={row.id} className="border-t border-border">
                      <td className="px-4 py-4 font-medium">{row.name}</td>
                      <td className="px-4 py-4 text-muted-foreground">{row.email}</td>
                      <td className="px-4 py-4 capitalize">{String(row.role).replace("_", " ")}</td>
                      <td className="px-4 py-4"><Badge className={`rounded-full ${statusBadgeClass(row.status)}`}>{row.status}</Badge></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
        <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
          <h2 className="font-semibold">Products / SKUs</h2>
          <div className="mt-3 space-y-2">
            {(campaign.products ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No products configured.</p>
            ) : (
              (campaign.products ?? []).map((product, index) => (
                <p key={`${product.sku ?? "sku"}-${index}`} className="text-sm">{product.name ?? product.sku ?? "Unnamed product"}</p>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <h2 className="font-semibold">Form Requirements</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-2 ">
          {Object.entries(campaign.form_requirements ?? {}).length === 0 ? (
            <p className="text-sm text-muted-foreground">No form rules configured.</p>
          ) : (
            Object.entries(campaign.form_requirements ?? {}).map(([key, enabled]) => (
              <p key={key} className="text-sm">{key}: {enabled ? "Required" : "Optional"}</p>
            ))
          )}
        </div>
      </section>

      <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <h2 className="font-semibold">Campaign Activities</h2>
        <p className="mt-1 text-sm text-muted-foreground">Latest visit events grouped with related sales lines.</p>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <input type="date" className="h-11 rounded-full border border-border bg-background px-4 text-sm" value={dateFrom} onChange={(e) => onDateFromChange(e.target.value)} />
          <input type="date" className="h-11 rounded-full border border-border bg-background px-4 text-sm" value={dateTo} onChange={(e) => onDateToChange(e.target.value)} />
          <Button variant="outline" className="h-11 rounded-full" onClick={onClearDateFilter}>Clear Date Filter</Button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <input className="h-11 rounded-full border border-border bg-background px-4 text-sm" placeholder="Search outlet/actor/status" value={activitySearch} onChange={(e) => onActivitySearchChange(e.target.value)} />
          <Select value={activityStatusFilter} onValueChange={onActivityStatusFilterChange}>
            <SelectTrigger className="w-45 rounded-full"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="converted">Converted</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="revisit">Revisit</SelectItem>
              <SelectItem value="no_sale">No sale</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="rounded-full" onClick={onApplyFilters}>Apply Filters</Button>
        </div>
        <div className="mt-4 overflow-hidden rounded-3xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Activity</th>
                <th className="px-4 py-3 text-left font-medium">Customer</th>
                <th className="px-4 py-3 text-left font-medium">Customer Phone</th>
                <th className="px-4 py-3 text-left font-medium">Outlet</th>
                <th className="px-4 py-3 text-left font-medium">Area</th>
                <th className="px-4 py-3 text-left font-medium">Products</th>
                <th className="px-4 py-3 text-left font-medium">Location</th>
                <th className="px-4 py-3 text-left font-medium">Actor</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Date</th>
                <th className="px-4 py-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {activities.length === 0 ? (
                <tr className="border-t border-border"><td className="px-4 py-6 text-muted-foreground" colSpan={11}>No activities yet for this campaign.</td></tr>
              ) : (
                activities.map((item) => (
                  <tr key={item.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-4 capitalize">{item.taskType ?? (item.type === "visit" ? "visit" : "sale")}</td>
                    <td className="px-4 py-4">{item.customer ?? "-"}</td>
                    <td className="px-4 py-4">{item.outletPhone ?? "N/A"}</td>
                    <td className="px-4 py-4">{item.outlet}</td>
                    <td className="px-4 py-4">{item.area ?? "-"}</td>
                    <td className="px-4 py-4">{item.products ?? "-"}</td>
                    <td className="px-4 py-4 text-muted-foreground">{item.location ?? "-"}</td>
                    <td className="px-4 py-4">{item.actor}</td>
                    <td className="px-4 py-4"><Badge className={`rounded-full capitalize ${activityStatusBadgeClass(item.status)}`}>{item.status}</Badge></td>
                    <td className="px-4 py-4 text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-4"><Link href={`/admin/campaigns/${campaign.id}/activities/${item.id}`} className="text-sm text-primary underline">View details</Link></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
          <p>Showing {activities.length === 0 ? 0 : (activityPage - 1) * 20 + 1}–{(activityPage - 1) * 20 + activities.length} of {activitiesTotal}</p>
          <div className="flex gap-2">
            <Button variant="outline" className="rounded-full" disabled={activityPage <= 1} onClick={onPreviousPage}>Previous</Button>
            <Button variant="outline" className="rounded-full" disabled={activityPage * 20 >= activitiesTotal} onClick={onNextPage}>Next</Button>
          </div>
        </div>
      </section>

      <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <h2 className="font-semibold">Photo Evidence Gallery</h2>
        <p className="mt-1 text-sm text-muted-foreground">All uploaded campaign evidence with signed preview links.</p>
        <div className="mt-4"><EvidenceGallery evidence={evidence} onDelete={onDeleteEvidence} deletingId={deletingEvidenceId} /></div>
        {evidencePagination.hasMore ? (
          <div className="mt-3">
            <Button variant="outline" className="rounded-full" disabled={loadingMoreEvidence} onClick={onLoadMoreEvidence}>
              {loadingMoreEvidence ? "Loading…" : "Load more"}
            </Button>
          </div>
        ) : null}
      </section>

      {deleteDialog}
    </>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusBadgeClass(status: string) {
  if (status === "active")    return "bg-emerald-500/10 text-emerald-600";
  if (status === "invited")   return "bg-amber-500/10 text-amber-600";
  if (status === "suspended") return "bg-red-500/10 text-red-600";
  return "bg-muted text-muted-foreground";
}

function activityStatusBadgeClass(status: string) {
  if (status === "converted") return "bg-emerald-500/10 text-emerald-600";
  if (status === "onboarded") return "bg-sky-500/10 text-sky-600";
  if (status === "pending")   return "bg-amber-500/10 text-amber-600";
  if (status === "revisit")   return "bg-violet-500/10 text-violet-600";
  return "bg-muted text-muted-foreground";
}

function Info2({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-muted/40 px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}

function KpiCard({
  label, value, trend, dataKey, highlight = false,
}: {
  label: string; value: string;
  trend?: Array<{ day: string; submissions: number; conversions: number }>;
  dataKey: "submissions" | "conversions";
  highlight?: boolean;
}) {
  const normalizedTrend = useMemo(() => {
    if (!trend || trend.length === 0) return [{ day: "S", submissions: 0, conversions: 0 }, { day: "N", submissions: 0, conversions: 0 }];
    if (trend.length === 1) return [{ day: "Prev", submissions: 0, conversions: 0 }, trend[0]];
    return trend;
  }, [trend]);

  return (
    <div className={`rounded-2xl border p-4 ${highlight ? "border-primary/20 bg-primary/5" : "border-border bg-card"}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tracking-tight">{value}</p>
      <div className="mt-3 h-10">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={normalizedTrend}>
            <RechartsTooltip
              cursor={false}
              contentStyle={{ borderRadius: 10, borderColor: "var(--border)", background: "var(--card)", fontSize: 11 }}
              labelStyle={{ color: "var(--muted-foreground)" }}
            />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={highlight ? "var(--primary)" : "var(--color-chart-1)"}
              strokeWidth={2}
              fill={highlight ? "var(--primary)" : "var(--color-chart-1)"}
              fillOpacity={0.12}
              dot={false}
              activeDot={{ r: 3 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function AchievementCard({ label, achieved, target }: { label: string; achieved: number; target: number }) {
  const pct = target > 0 ? Math.min(100, (achieved / target) * 100) : 0;
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-400" : "bg-primary/60";
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tracking-tight">
        {achieved}<span className="ml-1 text-sm font-normal text-muted-foreground">/ {target}</span>
      </p>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">{pct.toFixed(1)}% achieved</p>
    </div>
  );
}
