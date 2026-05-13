"use client";

import Link from "next/link";
import { useState } from "react";
import { Copy, Eye, EyeOff } from "lucide-react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import UserStatusBadge from "@/components/admin/UserStatusBadge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { authorizedFetch } from "@/lib/api/client";

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

export default function RepDetailsPage() {
  const params = useParams<{ id: string }>();
  const repId = params.id;
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

  if (query.isLoading) return <div className="rounded-4xl bg-card p-10 text-center ring-1 ring-border/60">Loading rep...</div>;
  if (!query.data) return <div className="rounded-4xl bg-card p-10 text-center ring-1 ring-border/60">Rep not found.</div>;
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
    if (!rep.accountNumber) {
      toast.error("No account number to copy.");
      return;
    }
    try {
      await navigator.clipboard.writeText(rep.accountNumber);
      toast.success("Account number copied.");
    } catch {
      toast.error("Could not copy account number.");
    }
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <UserStatusBadge status={rep.status} />
            <span className="text-sm text-muted-foreground">{rep.repCode}</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">{rep.fullName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{rep.phone || "-"} · {rep.email || "-"}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="rounded-full" asChild><Link href="/admin/reps">Back</Link></Button>
          <Button className="rounded-full px-5" asChild><Link href={`/admin/reps/${rep.id}/edit`}>Edit Rep</Link></Button>
        </div>
      </div>

      <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Info label="Territory" value={[rep.lga, rep.state].filter(Boolean).join(", ") || "-"} />
          <Info label="Target outlets" value={rep.targetOutlets?.toString() ?? "-"} />
          <Info label="Target conversions" value={rep.targetConversions?.toString() ?? "-"} />
          <Info label="Campaigns" value={rep.campaigns.length ? rep.campaigns.map((x) => x.name).join(", ") : "-"} />
          <Info label="Notes" value={rep.notes || "-"} />
          <Info label="Last sign in" value={rep.lastSignInAt ? new Date(rep.lastSignInAt).toLocaleString() : "-"} />
          <Info label="Last activity" value={rep.lastActivityAt ? new Date(rep.lastActivityAt).toLocaleString() : "-"} />
        </div>
      </section>

      <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <h2 className="font-medium">Payment Information</h2>
        <p className="mt-1 text-sm text-muted-foreground">Visible to authorized admins only.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Info label="Bank" value={rep.bankName || "-"} />
          <div className="rounded-3xl bg-background p-4">
            <p className="text-xs text-muted-foreground">Account number</p>
            <div className="flex items-start justify-between gap-3">
              <p className="mt-1 font-medium">{showAccountNumber ? rep.accountNumber || "-" : maskAccountNumber(rep.accountNumber)}</p>
              <TooltipProvider>
                <div className="flex items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
                        onClick={() => setShowAccountNumber((prev) => !prev)}
                        disabled={!rep.accountNumber}
                        aria-label={showAccountNumber ? "Hide account number" : "Reveal account number"}
                      >
                        {showAccountNumber ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{showAccountNumber ? "Hide account number" : "Reveal account number"}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
                        onClick={() => void copyAccountNumber()}
                        disabled={!rep.accountNumber}
                        aria-label="Copy account number"
                      >
                        <Copy className="size-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Copy account number</TooltipContent>
                  </Tooltip>
                </div>
              </TooltipProvider>
            </div>
          </div>
          <Info label="Account name" value={rep.accountName || "-"} />
          <Info label="Payment type" value={rep.paymentType || "-"} />
          <Info label="Daily rate" value={rep.dailyRate !== null && rep.dailyRate !== undefined ? `${rep.dailyRate}` : "-"} />
          <Info label="Commission rate (%)" value={rep.commissionRate !== null && rep.commissionRate !== undefined ? `${rep.commissionRate}` : "-"} />
        </div>
      </section>

      <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <h2 className="font-medium">Activity Timeline</h2>
        <p className="mt-1 text-sm text-muted-foreground">Latest visit and sales events linked to this rep.</p>
        <div className="mt-4 overflow-hidden rounded-3xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Type</th>
                <th className="px-4 py-3 text-left font-medium">Campaign</th>
                <th className="px-4 py-3 text-left font-medium">Outlet</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Details</th>
                <th className="px-4 py-3 text-left font-medium">Time</th>
                <th className="px-4 py-3 text-left font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {(rep.timeline ?? []).length === 0 ? (
                <tr className="border-t border-border">
                  <td className="px-4 py-4 text-muted-foreground" colSpan={7}>No activity yet.</td>
                </tr>
              ) : (
                (rep.timeline ?? []).map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="px-4 py-4 capitalize">{row.type}</td>
                    <td className="px-4 py-4">{row.campaign}</td>
                    <td className="px-4 py-4">{row.outlet}</td>
                    <td className="px-4 py-4 capitalize">{row.status}</td>
                    <td className="px-4 py-4 text-muted-foreground">{row.meta}</td>
                    <td className="px-4 py-4 text-muted-foreground">{new Date(row.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-4">
                      {row.campaignId ? (
                        <Button variant="outline" size="sm" className="rounded-full" asChild>
                          <Link href={`/admin/campaigns/${row.campaignId}/activities/${row.activityId}`}>View details</Link>
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
      </section>

      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {rep.status === "active" ? (
          <Button
            variant="destructive"
            className="rounded-full"
            onClick={() => updateStatus("inactive")}
            disabled={updatingStatus !== null}
          >
            {updatingStatus === "inactive" ? "Deactivating..." : "Deactivate"}
          </Button>
        ) : (
          <Button
            variant="outline"
            className="rounded-full border-green-400 bg-green-500/10 text-green-500"
            onClick={() => updateStatus("active")}
            disabled={updatingStatus !== null}
          >
            {updatingStatus === "active" ? "Activating..." : "Activate Account"}
          </Button>
        )}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-3xl bg-background p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-medium">{value}</p></div>;
}

function maskAccountNumber(accountNumber?: string | null) {
  if (!accountNumber) return "-";
  const clean = accountNumber.trim();
  if (clean.length <= 4) return clean;
  return `${clean.slice(0, 3)}${"*".repeat(Math.max(clean.length - 6, 2))}${clean.slice(-3)}`;
}
