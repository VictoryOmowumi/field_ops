"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabaseClient } from "@/lib/supabase/client";

type BillingAccount = {
  account_status: "in_good_standing" | "past_due" | "suspended" | "closed";
  implementation_fee_status: "pending" | "invoiced" | "paid" | "waived";
  default_currency: string;
};

type Invoice = {
  id: string;
  invoice_category: string;
  invoice_subtype: string;
  amount: number;
  currency: string;
  status: "draft" | "sent" | "paid" | "overdue" | "void";
  due_date: string | null;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
};

type InvoiceLineItem = { id: string; description: string; quantity: number; unit_amount: number };

type Activation = {
  id: string;
  activation_status: string;
  campaigns: { id: string; name: string; status: string; completed_at: string | null; archived_at: string | null } | null;
};

function retentionCountdownLabel(completedAt: string | null, retentionDays: number) {
  if (!completedAt) return null;
  const eligibleAt = new Date(completedAt).getTime() + retentionDays * 24 * 60 * 60 * 1000;
  const daysLeft = Math.ceil((eligibleAt - Date.now()) / (24 * 60 * 60 * 1000));
  if (daysLeft <= 0) return "Archives soon";
  return `Archives in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
}

function toTitleCase(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatAmount(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

function formatBytes(bytes: number) {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function AdminBillingPage() {
  const [billingAccount, setBillingAccount] = useState<BillingAccount | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [activations, setActivations] = useState<Activation[]>([]);
  const [outstandingAmount, setOutstandingAmount] = useState(0);
  const [storageBytes, setStorageBytes] = useState(0);
  const [retentionDays, setRetentionDays] = useState(180);
  const [loading, setLoading] = useState(true);
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);
  const [viewingLineItems, setViewingLineItems] = useState<InvoiceLineItem[]>([]);

  async function viewInvoice(invoiceId: string) {
    const { data } = await supabaseClient.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    const response = await fetch(`/api/admin/billing/invoices/${invoiceId}`, { headers: { Authorization: `Bearer ${token}` } });
    const result = (await response.json()) as { success: boolean; message?: string; invoice?: Invoice; lineItems?: InvoiceLineItem[] };
    if (!response.ok || !result.success || !result.invoice) {
      toast.error(result.message ?? "Failed to load invoice.");
      return;
    }
    setViewingInvoice(result.invoice);
    setViewingLineItems(result.lineItems ?? []);
  }

  useEffect(() => {
    async function load() {
      const { data } = await supabaseClient.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setLoading(false);
        toast.error("Session expired. Please sign in again.");
        return;
      }
      const response = await fetch("/api/admin/billing", { headers: { Authorization: `Bearer ${token}` } });
      const result = (await response.json()) as {
        success: boolean;
        message?: string;
        billingAccount?: BillingAccount;
        invoices?: Invoice[];
        activations?: Activation[];
        outstandingAmount?: number;
        storageBytes?: number;
        retentionDays?: number;
      };
      setLoading(false);
      if (!response.ok || !result.success) {
        toast.error(result.message ?? "Failed to load billing information.");
        return;
      }
      setBillingAccount(result.billingAccount ?? null);
      setInvoices(result.invoices ?? []);
      setActivations(result.activations ?? []);
      setOutstandingAmount(result.outstandingAmount ?? 0);
      setStorageBytes(result.storageBytes ?? 0);
      setRetentionDays(result.retentionDays ?? 180);
    }
    void load();
  }, []);

  if (loading) return <div className="rounded-4xl bg-card p-10 text-center ring-1 ring-border/60">Loading billing...</div>;
  if (!billingAccount) {
    return <div className="rounded-4xl bg-card p-10 text-center ring-1 ring-border/60 text-muted-foreground">No billing information available.</div>;
  }

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your organization&apos;s commercial standing, invoices, and campaign activation status.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <div className="rounded-[1.6rem] bg-card p-5 shadow-sm ring-1 ring-border/60">
          <p className="text-xs text-muted-foreground">Standing</p>
          <div className="mt-2">
            <Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/10">
              {toTitleCase(billingAccount.account_status)}
            </Badge>
          </div>
        </div>
        <div className="rounded-[1.6rem] bg-card p-5 shadow-sm ring-1 ring-border/60">
          <p className="text-xs text-muted-foreground">Outstanding balance</p>
          <p className="mt-2 text-3xl font-semibold">{formatAmount(outstandingAmount, billingAccount.default_currency)}</p>
        </div>
        <div className="rounded-[1.6rem] bg-card p-5 shadow-sm ring-1 ring-border/60">
          <p className="text-xs text-muted-foreground">Implementation fee</p>
          <p className="mt-2 text-3xl font-semibold">{toTitleCase(billingAccount.implementation_fee_status)}</p>
        </div>
      </div>

      {outstandingAmount > 0 ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700">
          You have an outstanding balance of {formatAmount(outstandingAmount, billingAccount.default_currency)}. Reach out to your account manager to settle it.
        </div>
      ) : null}

      <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <h2 className="font-semibold">Invoices</h2>
        {invoices.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No invoices yet.</p>
        ) : (
          <div className="mt-4 overflow-hidden rounded-2xl border border-border/60">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Type</th>
                  <th className="px-3 py-2 text-left font-medium">Amount</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium">Date</th>
                  <th className="px-3 py-2 text-left font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="border-t border-border/60">
                    <td className="px-3 py-3">{toTitleCase(invoice.invoice_subtype)}</td>
                    <td className="px-3 py-3">{formatAmount(invoice.amount, invoice.currency)}</td>
                    <td className="px-3 py-3">
                      <Badge
                        className={`rounded-full ${
                          invoice.status === "paid"
                            ? "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10"
                            : invoice.status === "overdue"
                            ? "bg-red-500/10 text-red-600 hover:bg-red-500/10"
                            : "bg-muted text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {toTitleCase(invoice.status)}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {invoice.paid_at ? new Date(invoice.paid_at).toLocaleDateString() : new Date(invoice.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-3">
                      <Button variant="outline" className="rounded-full" onClick={() => void viewInvoice(invoice.id)}>
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
          <h2 className="font-semibold">Campaign Activation Status</h2>
          {activations.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No campaigns yet.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {activations.map((activation) => {
                const campaign = activation.campaigns;
                const countdown = campaign?.status === "completed" ? retentionCountdownLabel(campaign.completed_at, retentionDays) : null;
                return (
                  <div key={activation.id} className="flex items-center justify-between rounded-2xl bg-muted/35 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{campaign?.name ?? "-"}</p>
                      <p className="text-xs text-muted-foreground">
                        {toTitleCase(campaign?.status ?? "-")}
                        {countdown ? ` · ${countdown}` : ""}
                      </p>
                    </div>
                    <Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/10">
                      {toTitleCase(activation.activation_status)}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
          <h2 className="font-semibold">Storage &amp; Retention</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-muted/35 p-4">
              <p className="text-xs text-muted-foreground">Evidence storage used</p>
              <p className="mt-1 font-medium">{formatBytes(storageBytes)}</p>
            </div>
            <div className="rounded-2xl bg-muted/35 p-4">
              <p className="text-xs text-muted-foreground">Retention window</p>
              <p className="mt-1 font-medium">{retentionDays} days after campaign completion</p>
            </div>
          </div>
        </section>
      </div>

      <Dialog open={Boolean(viewingInvoice)} onOpenChange={(open) => { if (!open) setViewingInvoice(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invoice details</DialogTitle>
            <DialogDescription>
              {viewingInvoice ? `${toTitleCase(viewingInvoice.invoice_subtype)} · ${toTitleCase(viewingInvoice.status)}` : ""}
            </DialogDescription>
          </DialogHeader>
          {viewingInvoice ? (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Category</p>
                  <p>{toTitleCase(viewingInvoice.invoice_category)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Due date</p>
                  <p>{viewingInvoice.due_date ? new Date(viewingInvoice.due_date).toLocaleDateString() : "—"}</p>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Line items</p>
                <div className="mt-1 space-y-1 rounded-xl border border-border/60">
                  {viewingLineItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between border-b border-border/40 px-3 py-2 last:border-b-0">
                      <span>{item.description} {item.quantity !== 1 ? `× ${item.quantity}` : ""}</span>
                      <span className="font-medium">{formatAmount(item.unit_amount * item.quantity, viewingInvoice.currency)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex justify-end text-sm font-semibold">
                  Total: {formatAmount(viewingInvoice.amount, viewingInvoice.currency)}
                </div>
              </div>
              {viewingInvoice.notes ? (
                <div>
                  <p className="text-xs text-muted-foreground">Notes</p>
                  <p>{viewingInvoice.notes}</p>
                </div>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" className="rounded-full">Close</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
