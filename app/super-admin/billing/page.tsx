"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabaseClient } from "@/lib/supabase/client";

type BillingAccountRow = {
  id: string;
  organization_id: string;
  account_status: "in_good_standing" | "past_due" | "suspended" | "closed";
  implementation_fee_status: "pending" | "invoiced" | "paid" | "waived";
  default_currency: string;
  outstanding_amount: number;
  outstanding_invoice_count: number;
  organizations: { id: string; name: string; slug: string; status: string } | null;
};

function toTitleCase(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function standingBadgeClass(status: BillingAccountRow["account_status"]) {
  if (status === "in_good_standing") return "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10";
  if (status === "past_due") return "bg-amber-500/10 text-amber-600 hover:bg-amber-500/10";
  return "bg-red-500/10 text-red-600 hover:bg-red-500/10";
}

function formatAmount(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

export default function SuperAdminBillingPage() {
  const [accounts, setAccounts] = useState<BillingAccountRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAccounts() {
      const { data } = await supabaseClient.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setLoading(false);
        toast.error("Session expired. Please sign in again.");
        return;
      }

      const response = await fetch("/api/platform/billing/accounts", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = (await response.json()) as { success: boolean; message?: string; accounts?: BillingAccountRow[] };
      setLoading(false);

      if (!response.ok || !result.success) {
        toast.error(result.message ?? "Failed to load billing accounts.");
        return;
      }
      setAccounts(result.accounts ?? []);
    }
    void loadAccounts();
  }, []);

  const totalOutstanding = accounts.reduce((sum, account) => sum + (account.outstanding_amount ?? 0), 0);
  const atRiskCount = accounts.filter((a) => a.account_status === "past_due" || a.account_status === "suspended").length;
  const pendingFeeCount = accounts.filter((a) => a.implementation_fee_status !== "paid" && a.implementation_fee_status !== "waived").length;

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Billing</h1>
          <p className="mt-1 text-sm text-muted-foreground">Commercial standing, outstanding balances, and implementation fees across all organizations.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="rounded-full" asChild>
            <Link href="/super-admin/billing/approvals">Campaign Activation Approvals</Link>
          </Button>
          <Button variant="outline" className="rounded-full" asChild>
            <Link href="/super-admin/billing/storage-migration">Storage Migration</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <Stat label="Total outstanding" value={formatAmount(totalOutstanding, "NGN")} />
        <Stat label="Accounts at risk" value={String(atRiskCount)} hint="past due or suspended" />
        <Stat label="Implementation fee pending" value={String(pendingFeeCount)} />
      </div>

      <section className="overflow-hidden rounded-3xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Organization</th>
              <th className="px-4 py-3 text-left font-medium">Standing</th>
              <th className="px-4 py-3 text-left font-medium">Implementation Fee</th>
              <th className="px-4 py-3 text-left font-medium">Outstanding</th>
              <th className="px-4 py-3 text-left font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className="border-t border-border">
                <td className="px-4 py-6 text-muted-foreground" colSpan={5}>Loading billing accounts...</td>
              </tr>
            ) : accounts.length === 0 ? (
              <tr className="border-t border-border">
                <td className="px-4 py-6 text-muted-foreground" colSpan={5}>No billing accounts yet.</td>
              </tr>
            ) : (
              accounts.map((account) => (
                <tr key={account.id} className="border-t border-border">
                  <td className="px-4 py-4">
                    <p className="font-medium">{account.organizations?.name ?? "-"}</p>
                    <p className="text-xs text-muted-foreground">{account.organizations?.slug ?? "-"}</p>
                  </td>
                  <td className="px-4 py-4">
                    <Badge className={`rounded-full ${standingBadgeClass(account.account_status)}`}>
                      {toTitleCase(account.account_status)}
                    </Badge>
                  </td>
                  <td className="px-4 py-4 text-muted-foreground">{toTitleCase(account.implementation_fee_status)}</td>
                  <td className="px-4 py-4">
                    {account.outstanding_amount > 0 ? (
                      <span className="font-medium text-amber-600">
                        {formatAmount(account.outstanding_amount, account.default_currency)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <Button variant="outline" className="rounded-full" asChild>
                      <Link href={`/super-admin/billing/${account.organization_id}`}>View</Link>
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[1.6rem] bg-card p-5 shadow-sm ring-1 ring-border/60">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
