"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Download, Pencil, Rocket, Share2, Trash2, Users } from "lucide-react";

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import CampaignPointMap from "@/components/campaign/CampaignPointMap";
import EvidenceGallery from "@/components/shared/EvidenceGallery";
import type { CampaignAnalyticsSummary, CampaignEvidenceItem, CampaignMapPoint } from "@/types/campaign-intelligence";

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
  onApplyFilters: () => void;
  activities: CampaignActivity[];
  activityPage: number;
  activitiesTotal: number;
  onPreviousPage: () => void;
  onNextPage: () => void;
};

export function CampaignDetailsSections({
  campaign,
  summary,
  mapPoints,
  supervisorNames,
  supervisorRows,
  assignedRepRows,
  evidence,
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
  onApplyFilters,
  activities,
  activityPage,
  activitiesTotal,
  onPreviousPage,
  onNextPage,
}: CampaignDetailsSectionsProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const posmConfigured =
    Boolean(campaign.form_requirements?.requirePosmDeployment) ||
    (campaign.campaign_tasks ?? []).includes("posm_deployment");

  return (
    <>
      <Button variant="outline" className="rounded-full" asChild>
        <Link href="/admin/campaigns" className="inline-flex items-center gap-2">
          <ArrowLeft className="size-4" />
          Back
        </Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/10">
              {campaign.status}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {campaign.start_date ?? "-"} - {campaign.end_date ?? "-"}
            </span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">{campaign.name}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {campaign.description || "No campaign description yet."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button className="rounded-full px-5" asChild>
            <Link href={`/admin/campaigns/${campaign.id}/edit`} className="inline-flex items-center gap-2">
              <Pencil className="size-4" />
              Edit Campaign
            </Link>
          </Button>
          <Button variant="outline" className="rounded-full px-5" disabled={exportingActivities} onClick={onExportActivities}>
            <span className="inline-flex items-center gap-2">
              <Download className="size-4" />
              {exportingActivities ? "Exporting..." : "Export Activities"}
            </span>
          </Button>
          {campaign.status === "draft" ? (
            <Button className="rounded-full px-5" disabled={launching} onClick={onLaunchCampaign}>
              <span className="inline-flex items-center gap-2">
                <Rocket className="size-4" />
                {launching ? "Launching..." : "Go Live"}
              </span>
            </Button>
          ) : null}
          <Button className="rounded-full px-5 bg-taupe-800 text-white" onClick={onOpenShareDialog}>
            <span className="inline-flex items-center gap-2">
              <Share2 className="size-4" />
              Share Campaign
            </span>
          </Button>
          <Button variant="destructive" className="rounded-full px-5" onClick={() => setDeleteOpen(true)} disabled={deletingCampaign}>
            <span className="inline-flex items-center gap-2">
              <Trash2 className="size-4" />
              Delete Campaign
            </span>
          </Button>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Info label="Total submissions" value={String(summary?.totalSubmissions ?? 0)} />
        <Info label="Unique outlets" value={String(summary?.uniqueOutlets ?? 0)} />
        <Info label="Areas covered" value={String(summary?.areasCovered ?? 0)} />
        <Info label="Conversion rate" value={`${(summary?.conversionRate ?? 0).toFixed(1)}%`} />
        <Info label="Sync health" value={`${(summary?.syncHealth ?? 0).toFixed(1)}%`} />
        {posmConfigured ? <Info label="POSM deployed" value={String(summary?.posmDeployed ?? 0)} /> : null}
        {posmConfigured ? <Info label="POSM units" value={String(summary?.posmUnits ?? 0)} /> : null}
      </section>

      <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <h2 className="font-semibold">Campaign Coverage Map</h2>
        <p className="mt-1 text-sm text-muted-foreground">Plotted coordinates captured from visits and sales records.</p>
        <div className="mt-4">
          <CampaignPointMap points={mapPoints} />
        </div>
      </section>

      <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <h2 className="font-semibold">Campaign Overview</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Info2 label="Campaign type" value={campaign.campaign_type || "-"} />
          <Info2 label="Tasks" value={(campaign.campaign_tasks ?? []).length ? (campaign.campaign_tasks ?? []).join(", ") : "-"} />
          <Info2 label="Territory" value={[campaign.state, campaign.lga].filter(Boolean).join(" / ") || "-"} />
          <Info2 label="Assigned supervisors" value={supervisorRows.length > 1 ? `${supervisorRows.length} supervisors` : supervisorNames} />
          <Info2 label="Target outlets" value={campaign.target_outlets?.toLocaleString() ?? "-"} />
          <Info2 label="Target conversions" value={campaign.target_conversions?.toLocaleString() ?? "-"} />
          <Info2 label="Expected reps" value={campaign.expected_reps?.toLocaleString() ?? "-"} />
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
                    <td className="px-4 py-4">
                      <Badge className={`rounded-full ${statusBadgeClass(row.status)}`}>{row.status}</Badge>
                    </td>
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
              <p className="mt-1 text-sm text-muted-foreground">
                Campaign field agents with role and status.
              </p>
            </div>
            <Button variant="outline" className="rounded-full" onClick={onOpenAssignDialog}>
              <span className="inline-flex items-center gap-2">
                <Users className="size-4" />
                Assign Supervisors & Reps
              </span>
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
                  <tr className="border-t border-border">
                    <td className="px-4 py-6 text-muted-foreground" colSpan={4}>
                      No reps assigned yet.
                    </td>
                  </tr>
                ) : (
                  assignedRepRows.map((row) => (
                    <tr key={row.id} className="border-t border-border">
                      <td className="px-4 py-4 font-medium">{row.name}</td>
                      <td className="px-4 py-4 text-muted-foreground">{row.email}</td>
                      <td className="px-4 py-4 capitalize">{String(row.role).replace("_", " ")}</td>
                      <td className="px-4 py-4">
                        <Badge className={`rounded-full ${statusBadgeClass(row.status)}`}>{row.status}</Badge>
                      </td>
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
                <p key={`${product.sku ?? "sku"}-${index}`} className="text-sm">
                  {product.name ?? product.sku ?? "Unnamed product"}
                </p>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <h2 className="font-semibold">Form Requirements</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {Object.entries(campaign.form_requirements ?? {}).length === 0 ? (
            <p className="text-sm text-muted-foreground">No form rules configured.</p>
          ) : (
            Object.entries(campaign.form_requirements ?? {}).map(([key, enabled]) => (
              <p key={key} className="text-sm">
                {key}: {enabled ? "Required" : "Optional"}
              </p>
            ))
          )}
        </div>
      </section>

      <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <h2 className="font-semibold">Campaign Activities</h2>
        <p className="mt-1 text-sm text-muted-foreground">Latest visit events grouped with related sales lines.</p>
        <div className="mt-4 flex flex-wrap gap-2 ">
          <input
            className="h-11 rounded-full border border-border bg-background px-4 text-sm"
            placeholder="Search outlet/actor/status"
            value={activitySearch}
            onChange={(event) => onActivitySearchChange(event.target.value)}
          />
          <Select value={activityStatusFilter} onValueChange={onActivityStatusFilterChange}>
            <SelectTrigger className="w-45 rounded-full">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="converted">Converted</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="revisit">Revisit</SelectItem>
              <SelectItem value="no_sale">No sale</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="rounded-full" onClick={onApplyFilters}>
            Apply Filters
          </Button>
        </div>
        <div className="mt-4 overflow-hidden rounded-3xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Activity</th>
                <th className="px-4 py-3 text-left font-medium">Customer</th>
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
                <tr className="border-t border-border">
                  <td className="px-4 py-6 text-muted-foreground" colSpan={10}>
                    No activities yet for this campaign.
                  </td>
                </tr>
              ) : (
                activities.map((item) => (
                  <tr key={item.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-4 capitalize">{item.taskType ?? (item.type === "visit" ? "visit" : "sale")}</td>
                    <td className="px-4 py-4">{item.customer ?? "-"}</td>
                    <td className="px-4 py-4">{item.outlet}</td>
                    <td className="px-4 py-4">{item.area ?? "-"}</td>
                    <td className="px-4 py-4">{item.products ?? "-"}</td>
                    <td className="px-4 py-4 text-muted-foreground">{item.location ?? "-"}</td>
                    <td className="px-4 py-4">{item.actor}</td>
                    <td className="px-4 py-4">
                      <Badge className="rounded-full capitalize">{item.status}</Badge>
                    </td>
                    <td className="px-4 py-4 text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-4">
                      <Link href={`/admin/campaigns/${campaign.id}/activities/${item.id}`} className="text-sm text-primary underline">
                        View details
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
          <p>
            Showing {activities.length === 0 ? 0 : (activityPage - 1) * 20 + 1}-
            {(activityPage - 1) * 20 + activities.length} of {activitiesTotal}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="rounded-full" disabled={activityPage <= 1} onClick={onPreviousPage}>
              Previous
            </Button>
            <Button variant="outline" className="rounded-full" disabled={activityPage * 20 >= activitiesTotal} onClick={onNextPage}>
              Next
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <h2 className="font-semibold">Photo Evidence Gallery</h2>
        <p className="mt-1 text-sm text-muted-foreground">All uploaded campaign evidence with signed preview links.</p>
        <div className="mt-4">
          <EvidenceGallery evidence={evidence} />
        </div>
      </section>

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
              {deletingCampaign ? "Deleting..." : "Delete Campaign"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function statusBadgeClass(status: string) {
  if (status === "active") return "bg-emerald-500/10 text-emerald-600";
  if (status === "invited") return "bg-amber-500/10 text-amber-600";
  if (status === "suspended") return "bg-red-500/10 text-red-600";
  return "bg-muted text-muted-foreground";
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex p-4 items-center gap-2 ">
      <p className="break-all font-semibold text-4xl">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function Info2({ label, value }: { label: string; value: string }) {
  return (
    <div className=" ">
      <p className="break-all font-semibold text-xl">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
