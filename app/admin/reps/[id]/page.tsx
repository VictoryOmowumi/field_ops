"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import UserStatusBadge from "@/components/admin/UserStatusBadge";
import { Button } from "@/components/ui/button";
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
};

export default function RepDetailsPage() {
  const params = useParams<{ id: string }>();
  const repId = params.id;

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

  async function updateStatus(status: "active" | "inactive" | "suspended") {
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
        </div>
      </section>

      <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <h2 className="font-medium">Lifecycle Actions</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" className="rounded-full" onClick={() => updateStatus("active")}>Set Active</Button>
          <Button variant="outline" className="rounded-full" onClick={() => updateStatus("inactive")}>Set Inactive</Button>
          <Button variant="outline" className="rounded-full" onClick={() => updateStatus("suspended")}>Suspend</Button>
        </div>
      </section>

      <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <h2 className="font-medium">Payment Information</h2>
        <p className="mt-1 text-sm text-muted-foreground">Visible to authorized admins only.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Info label="Bank" value={rep.bankName || "-"} />
          <Info label="Account number" value={maskAccountNumber(rep.accountNumber)} />
          <Info label="Account name" value={rep.accountName || "-"} />
          <Info label="Payment type" value={rep.paymentType || "-"} />
          <Info label="Daily rate" value={rep.dailyRate !== null && rep.dailyRate !== undefined ? `${rep.dailyRate}` : "-"} />
          <Info label="Commission rate (%)" value={rep.commissionRate !== null && rep.commissionRate !== undefined ? `${rep.commissionRate}` : "-"} />
        </div>
      </section>
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
