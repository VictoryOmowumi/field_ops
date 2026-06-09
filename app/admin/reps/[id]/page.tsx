"use client";

import Link from "next/link";
import { useState } from "react";
import { Copy, Eye, EyeOff, ArrowLeft, BarChart2, MapPin, Target, Users } from "lucide-react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import UserStatusBadge from "@/components/admin/UserStatusBadge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useUiVariant } from "@/components/providers/tenant-experience-provider";
import { authorizedFetch } from "@/lib/api/client";
import { cn } from "@/lib/utils";

type Rep = {
  id: string;
  repCode: string;
  fullName: string;
  email: string;
  phone: string;
  status: string;
  state: string | null;
  lga: string | null;
  targetOutlets: number | null;
  targetConversions: number | null;
  notes: string | null;
  campaigns: Array<{ id: string; name: string }>;
  bankName?: string | null;
  accountNumber?: string | null;
  accountName?: string | null;
  paymentType?: string | null;
  dailyRate?: number | null;
  commissionRate?: number | null;
  lastSignInAt?: string | null;
  lastActivityAt?: string | null;
  timeline?: Array<{
    id: string;
    type: "visit" | "sale";
    activityId: string;
    campaignId: string | null;
    createdAt: string;
    campaign: string;
    outlet: string;
    status: string;
    meta: string;
  }>;
};

function getInitials(name: string) {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "?";
  if (tokens.length === 1) return tokens[0].slice(0, 2).toUpperCase();
  return `${tokens[0][0] ?? ""}${tokens[1][0] ?? ""}`.toUpperCase();
}

export default function RepDetailsPage() {
  const params = useParams<{ id: string }>();
  const repId = params.id;
  const uiVariant = useUiVariant();
  const isEnhanced = uiVariant === "enhanced";
  const [showAccountNumber, setShowAccountNumber] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState<"active" | "inactive" | null>(null);

  const query = useQuery({
    queryKey: ["rep", repId],
    queryFn: async () => {
      const result = await authorizedFetch<{ success: boolean; rep: Rep }>(`/api/admin/reps/${repId}`);
      return result.rep;
    },
  });
  if (query.error) toast.error((query.error as Error).message);

  if (query.isLoading) {
    return (
      <div className="space-y-5 pb-10">
        <div className="h-36 animate-pulse rounded-3xl bg-muted" />
        <div className="h-48 animate-pulse rounded-3xl bg-muted" />
        <div className="h-64 animate-pulse rounded-3xl bg-muted" />
      </div>
    );
  }
  if (!query.data) {
    return (
      <div className="rounded-3xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
        Rep not found.
      </div>
    );
  }
  const rep = query.data;

  async function updateStatus(status: "active" | "inactive") {
    setUpdatingStatus(status);
    try {
      await authorizedFetch<{ success: boolean }>(`/api/admin/reps/${rep.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      toast.success(`Rep marked as ${status}.`);
      await query.refetch();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setUpdatingStatus(null);
    }
  }

  async function copyAccountNumber() {
    if (!rep.accountNumber) { toast.error("No account number to copy."); return; }
    try {
      await navigator.clipboard.writeText(rep.accountNumber);
      toast.success("Account number copied.");
    } catch {
      toast.error("Could not copy account number.");
    }
  }

  const territory = [rep.lga, rep.state].filter(Boolean).join(", ") || "-";
  const campaignNames = rep.campaigns.length ? rep.campaigns.map((x) => x.name).join(", ") : "-";

  const timeline = rep.timeline ?? [];
  const visitCount      = timeline.filter((r) => r.type === "visit").length;
  const saleCount       = timeline.filter((r) => r.type === "sale").length;
  const conversionCount = timeline.filter((r) => r.status === "converted").length;

  const actionButtons = (
    <div className="flex flex-wrap gap-2">
      {isEnhanced ? (
        <Button variant="outline" className="rounded-full" asChild>
          <Link href="/admin/reps" className="inline-flex items-center gap-2">
            <ArrowLeft className="size-4" />Back
          </Link>
        </Button>
      ) : (
        <Button variant="outline" className="rounded-full" asChild>
          <Link href="/admin/reps">Back</Link>
        </Button>
      )}
      <Button className="rounded-full px-5" asChild>
        <Link href={`/admin/reps/${rep.id}/edit`}>Edit Rep</Link>
      </Button>
      {rep.status === "active" ? (
        <Button variant="destructive" className="rounded-full" onClick={() => updateStatus("inactive")} disabled={updatingStatus !== null}>
          {updatingStatus === "inactive" ? "Deactivating…" : "Deactivate"}
        </Button>
      ) : (
        <Button variant="outline" className="rounded-full border-emerald-400 bg-emerald-500/10 text-emerald-600" onClick={() => updateStatus("active")} disabled={updatingStatus !== null}>
          {updatingStatus === "active" ? "Activating…" : "Activate"}
        </Button>
      )}
    </div>
  );

  // ── Enhanced layout ──────────────────────────────────────────────────────

  if (isEnhanced) {
    return (
      <div className="space-y-5 pb-10">
        {/* Profile header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar className="size-16 rounded-2xl ring-2 ring-border">
                <AvatarFallback className="rounded-2xl bg-primary/10 text-lg font-semibold text-primary">
                  {getInitials(rep.fullName)}
                </AvatarFallback>
              </Avatar>
              <span className={cn(
                "absolute -bottom-1 -right-1 size-3.5 rounded-full border-2 border-background",
                rep.status === "active" ? "bg-emerald-500" : "bg-muted-foreground/30"
              )} />
            </div>
            <div>
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <UserStatusBadge status={rep.status} />
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-mono text-muted-foreground">{rep.repCode}</span>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">{rep.fullName}</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">{rep.phone || "-"} · {rep.email || "-"}</p>
              {territory !== "-" ? (
                <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="size-3" />{territory}
                </p>
              ) : null}
            </div>
          </div>
          {actionButtons}
        </div>

        {/* Performance KPI tiles */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <PerformanceTile
            icon={<BarChart2 className="size-4 text-sky-500" />}
            label="Total visits"
            value={String(visitCount)}
            bg="bg-sky-500/5"
          />
          <PerformanceTile
            icon={<Target className="size-4 text-emerald-500" />}
            label="Conversions"
            value={String(conversionCount)}
            sub={visitCount > 0 ? `${((conversionCount / visitCount) * 100).toFixed(0)}% rate` : undefined}
            bg="bg-emerald-500/5"
            highlight
          />
          <PerformanceTile
            icon={<BarChart2 className="size-4 text-amber-500" />}
            label="Sales records"
            value={String(saleCount)}
            bg="bg-amber-500/5"
          />
          <PerformanceTile
            icon={<Users className="size-4 text-violet-500" />}
            label="Campaigns"
            value={String(rep.campaigns.length)}
            sub={rep.campaigns.length > 0 ? rep.campaigns[0].name : undefined}
            bg="bg-violet-500/5"
          />
        </div>

        {/* Targets progress */}
        {(rep.targetOutlets || rep.targetConversions) ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {rep.targetOutlets ? (
              <ProgressCard
                label="Outlet target"
                achieved={visitCount}
                target={rep.targetOutlets}
              />
            ) : null}
            {rep.targetConversions ? (
              <ProgressCard
                label="Conversion target"
                achieved={conversionCount}
                target={rep.targetConversions}
              />
            ) : null}
          </div>
        ) : null}

        {/* Rep info + Payment side by side */}
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-3xl border border-border bg-card p-5">
            <h2 className="font-semibold">Rep Information</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <InfoCell label="Campaigns"    value={campaignNames} />
              <InfoCell label="Notes"        value={rep.notes || "-"} />
              <InfoCell label="Last sign in" value={rep.lastSignInAt ? new Date(rep.lastSignInAt).toLocaleString() : "-"} />
              <InfoCell label="Last activity" value={rep.lastActivityAt ? new Date(rep.lastActivityAt).toLocaleString() : "-"} />
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">Payment Information</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">Visible to authorized admins only.</p>
              </div>
              <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-600">Confidential</span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <InfoCell label="Bank"           value={rep.bankName || "-"} />
              <InfoCell label="Account name"   value={rep.accountName || "-"} />
              <div className="rounded-2xl bg-muted/40 px-4 py-3">
                <p className="text-xs text-muted-foreground">Account number</p>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <p className="font-medium">{showAccountNumber ? rep.accountNumber || "-" : maskAccountNumber(rep.accountNumber)}</p>
                  <TooltipProvider>
                    <div className="flex items-center gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-background hover:text-foreground disabled:opacity-50" onClick={() => setShowAccountNumber((v) => !v)} disabled={!rep.accountNumber}>
                            {showAccountNumber ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{showAccountNumber ? "Hide" : "Reveal"}</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-background hover:text-foreground disabled:opacity-50" onClick={() => void copyAccountNumber()} disabled={!rep.accountNumber}>
                            <Copy className="size-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Copy</TooltipContent>
                      </Tooltip>
                    </div>
                  </TooltipProvider>
                </div>
              </div>
              <InfoCell label="Payment type"     value={rep.paymentType || "-"} />
              <InfoCell label="Daily rate"        value={rep.dailyRate != null ? String(rep.dailyRate) : "-"} />
              <InfoCell label="Commission rate"   value={rep.commissionRate != null ? `${rep.commissionRate}%` : "-"} />
            </div>
          </section>
        </div>

        {/* Activity timeline */}
        <section className="rounded-3xl border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">Activity Timeline</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Latest visit and sales events linked to this rep — {timeline.length} records.
              </p>
            </div>
          </div>
          <div className="mt-4 overflow-hidden rounded-2xl border border-border">
            <div className="overflow-x-auto">
              <table className="min-w-[700px] w-full text-sm">
                <thead className="border-b border-border bg-muted/30 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold">Campaign</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold">Outlet</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold">Details</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold">Time</th>
                    <th className="w-20 px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {timeline.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">No activity yet.</td>
                    </tr>
                  ) : (
                    timeline.map((row) => (
                      <tr key={row.id} className={cn(
                        "transition-colors hover:bg-primary/5",
                        row.status === "converted" && "bg-emerald-500/[0.04]"
                      )}>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5">
                            <span className={cn(
                              "size-1.5 shrink-0 rounded-full",
                              row.type === "sale" ? "bg-emerald-500" : "bg-sky-400"
                            )} />
                            <Badge variant="outline" className={cn(
                              "rounded-full capitalize text-xs",
                              row.type === "sale"
                                ? "border-emerald-200 bg-emerald-500/10 text-emerald-600"
                                : "border-sky-200 bg-sky-500/10 text-sky-600"
                            )}>
                              {row.type}
                            </Badge>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 font-medium">{row.campaign}</td>
                        <td className="px-4 py-3.5">{row.outlet}</td>
                        <td className="px-4 py-3.5">
                          <span className={cn(
                            "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
                            row.status === "converted" ? "bg-emerald-500/10 text-emerald-600" :
                            row.status === "revisit"   ? "bg-violet-500/10 text-violet-600"   :
                            row.status === "pending"   ? "bg-amber-400/10 text-amber-600"      :
                            "bg-muted text-muted-foreground"
                          )}>
                            {row.status}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-muted-foreground">{row.meta}</td>
                        <td className="px-4 py-3.5 text-xs text-muted-foreground">{new Date(row.createdAt).toLocaleString()}</td>
                        <td className="px-4 py-3.5 text-right">
                          {row.campaignId ? (
                            <Button variant="outline" size="sm" className="rounded-full text-xs" asChild>
                              <Link href={`/admin/campaigns/${row.campaignId}/activities/${row.activityId}`}>View</Link>
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    );
  }

  // ── Classic layout (existing) ────────────────────────────────────────────

  return (
    <div className="space-y-5 pb-10">
      {/* ── Profile header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-4">
          <Avatar className="size-16 rounded-2xl">
            <AvatarFallback className="rounded-2xl bg-primary/10 text-lg font-semibold text-primary">
              {getInitials(rep.fullName)}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <UserStatusBadge status={rep.status} />
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-mono text-muted-foreground">{rep.repCode}</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">{rep.fullName}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{rep.phone || "-"} · {rep.email || "-"}</p>
          </div>
        </div>
        {actionButtons}
      </div>

      {/* ── Quick stats ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Territory" value={territory} />
        <StatTile label="Target outlets" value={rep.targetOutlets?.toLocaleString() ?? "-"} />
        <StatTile label="Target conversions" value={rep.targetConversions?.toLocaleString() ?? "-"} />
        <StatTile label="Assigned campaigns" value={String(rep.campaigns.length)} sub={rep.campaigns.length > 0 ? rep.campaigns[0].name : undefined} />
      </div>

      {/* ── Rep details ── */}
      <section className="rounded-3xl border border-border bg-card p-5">
        <h2 className="font-semibold">Rep Information</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <InfoCell label="Campaigns" value={campaignNames} />
          <InfoCell label="Notes" value={rep.notes || "-"} />
          <InfoCell label="Last sign in" value={rep.lastSignInAt ? new Date(rep.lastSignInAt).toLocaleString() : "-"} />
          <InfoCell label="Last activity" value={rep.lastActivityAt ? new Date(rep.lastActivityAt).toLocaleString() : "-"} />
        </div>
      </section>

      {/* ── Payment info ── */}
      <section className="rounded-3xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Payment Information</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Visible to authorized admins only.</p>
          </div>
          <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-600">Confidential</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <InfoCell label="Bank" value={rep.bankName || "-"} />
          <div className="rounded-2xl bg-muted/40 px-4 py-3">
            <p className="text-xs text-muted-foreground">Account number</p>
            <div className="mt-1 flex items-center justify-between gap-3">
              <p className="font-medium">{showAccountNumber ? rep.accountNumber || "-" : maskAccountNumber(rep.accountNumber)}</p>
              <TooltipProvider>
                <div className="flex items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-background hover:text-foreground disabled:opacity-50"
                        onClick={() => setShowAccountNumber((v) => !v)}
                        disabled={!rep.accountNumber}
                      >
                        {showAccountNumber ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{showAccountNumber ? "Hide" : "Reveal"}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-background hover:text-foreground disabled:opacity-50"
                        onClick={() => void copyAccountNumber()}
                        disabled={!rep.accountNumber}
                      >
                        <Copy className="size-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Copy</TooltipContent>
                  </Tooltip>
                </div>
              </TooltipProvider>
            </div>
          </div>
          <InfoCell label="Account name" value={rep.accountName || "-"} />
          <InfoCell label="Payment type" value={rep.paymentType || "-"} />
          <InfoCell label="Daily rate" value={rep.dailyRate != null ? String(rep.dailyRate) : "-"} />
          <InfoCell label="Commission rate" value={rep.commissionRate != null ? `${rep.commissionRate}%` : "-"} />
        </div>
      </section>

      {/* ── Activity timeline ── */}
      <section className="rounded-3xl border border-border bg-card p-5">
        <h2 className="font-semibold">Activity Timeline</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">Latest visit and sales events linked to this rep.</p>
        <div className="mt-4 overflow-hidden rounded-2xl border border-border">
          <div className="overflow-x-auto">
            <table className="min-w-[700px] w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold">Campaign</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold">Outlet</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold">Details</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold">Time</th>
                  <th className="w-20 px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {timeline.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">No activity yet.</td>
                  </tr>
                ) : (
                  timeline.map((row) => (
                    <tr key={row.id} className="odd:bg-card even:bg-muted/20 hover:bg-primary/5 transition-colors">
                      <td className="px-4 py-3.5">
                        <Badge variant="outline" className={`rounded-full capitalize text-xs ${row.type === "sale" ? "border-emerald-200 bg-emerald-500/10 text-emerald-600" : "border-sky-200 bg-sky-500/10 text-sky-600"}`}>
                          {row.type}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5 font-medium">{row.campaign}</td>
                      <td className="px-4 py-3.5">{row.outlet}</td>
                      <td className="px-4 py-3.5 capitalize">{row.status}</td>
                      <td className="px-4 py-3.5 text-muted-foreground text-xs">{row.meta}</td>
                      <td className="px-4 py-3.5 text-xs text-muted-foreground">{new Date(row.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-3.5 text-right">
                        {row.campaignId ? (
                          <Button variant="outline" size="sm" className="rounded-full text-xs" asChild>
                            <Link href={`/admin/campaigns/${row.campaignId}/activities/${row.activityId}`}>View</Link>
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

// ── Enhanced helpers ──────────────────────────────────────────────────────────

function PerformanceTile({
  icon, label, value, sub, bg = "bg-muted/40", highlight = false,
}: {
  icon: React.ReactNode; label: string; value: string; sub?: string;
  bg?: string; highlight?: boolean;
}) {
  return (
    <div className={cn("rounded-2xl border border-border p-4", bg, highlight && "border-primary/20")}>
      <div className="mb-3 flex items-center gap-2">
        <div className="grid size-8 place-items-center rounded-xl bg-background">{icon}</div>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className="text-2xl font-semibold tracking-tight">{value}</p>
      {sub ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function ProgressCard({ label, achieved, target }: { label: string; achieved: number; target: number }) {
  const pct = target > 0 ? Math.min(100, (achieved / target) * 100) : 0;
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-400" : "bg-primary/60";
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-xl font-semibold tracking-tight">
        {achieved}<span className="ml-1 text-sm font-normal text-muted-foreground">/ {target}</span>
      </p>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-all duration-500", color)} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{pct.toFixed(0)}% of target</p>
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-muted/40 px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}

// ── Classic helpers ───────────────────────────────────────────────────────────

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-xl font-semibold tracking-tight">{value}</p>
      {sub ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function maskAccountNumber(accountNumber?: string | null) {
  if (!accountNumber) return "-";
  const clean = accountNumber.trim();
  if (clean.length <= 4) return clean;
  return `${clean.slice(0, 3)}${"*".repeat(Math.max(clean.length - 6, 2))}${clean.slice(-3)}`;
}
