"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabaseClient } from "@/lib/supabase/client";

type BillingAccount = {
  id: string;
  organization_id: string;
  account_status: "in_good_standing" | "past_due" | "suspended" | "closed";
  implementation_fee_status: "pending" | "invoiced" | "paid" | "waived";
  default_currency: string;
  billing_contact_email: string | null;
  gating_override: boolean | null;
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
  created_at: string;
  campaigns: { id: string; name: string; status: string } | null;
};

type Allocation = {
  id: string;
  allocation_type: string;
  status: string;
  starts_at: string;
  ends_at: string | null;
  cost_amount: number | null;
};

type Organization = { id: string; name: string; slug: string; status: string };

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

const INVOICE_CATEGORIES = ["one_time", "per_campaign", "recurring", "usage_based"] as const;
const INVOICE_SUBTYPES = ["implementation", "activation", "infrastructure", "archive_storage", "reactivation", "enhancement"] as const;

async function authHeader() {
  const { data } = await supabaseClient.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : null;
}

export default function BillingAccountDetailPage() {
  const params = useParams<{ id: string }>();
  const organizationId = params.id;

  const [organization, setOrganization] = useState<Organization | null>(null);
  const [billingAccount, setBillingAccount] = useState<BillingAccount | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [activations, setActivations] = useState<Activation[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [outstandingAmount, setOutstandingAmount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);
  const [archivingCampaignId, setArchivingCampaignId] = useState<string | null>(null);
  const [sendingInvoiceId, setSendingInvoiceId] = useState<string | null>(null);
  const [voidingInvoiceId, setVoidingInvoiceId] = useState<string | null>(null);

  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);
  const [viewingLineItems, setViewingLineItems] = useState<InvoiceLineItem[]>([]);

  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [editCategory, setEditCategory] = useState<(typeof INVOICE_CATEGORIES)[number]>("one_time");
  const [editSubtype, setEditSubtype] = useState<(typeof INVOICE_SUBTYPES)[number]>("implementation");
  const [editLineItems, setEditLineItems] = useState([{ description: "", unitAmount: "" }]);
  const [editNotes, setEditNotes] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [savingGatingOverride, setSavingGatingOverride] = useState(false);

  const [invoiceCategory, setInvoiceCategory] = useState<(typeof INVOICE_CATEGORIES)[number]>("one_time");
  const [invoiceSubtype, setInvoiceSubtype] = useState<(typeof INVOICE_SUBTYPES)[number]>("implementation");
  const [lineItems, setLineItems] = useState([{ description: "", unitAmount: "" }]);
  const [notes, setNotes] = useState("");
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  type AccountDetailResponse = {
    success: boolean;
    message?: string;
    organization?: Organization;
    billingAccount?: BillingAccount;
    invoices?: Invoice[];
    activations?: Activation[];
    allocations?: Allocation[];
    outstandingAmount?: number;
  };

  function applyAccountDetail(result: AccountDetailResponse) {
    setOrganization(result.organization ?? null);
    setBillingAccount(result.billingAccount ?? null);
    setInvoices(result.invoices ?? []);
    setActivations(result.activations ?? []);
    setAllocations(result.allocations ?? []);
    setOutstandingAmount(result.outstandingAmount ?? 0);
  }

  // Reload after a mutation (mark-paid, create-invoice). Deliberately not referenced from the
  // mount effect below — that effect has its own self-contained loader — since an effect calling
  // a function shared with click handlers can't be proven side-effect-free by the compiler.
  async function refresh() {
    const headers = await authHeader();
    if (!headers) {
      toast.error("Session expired. Please sign in again.");
      return;
    }
    const response = await fetch(`/api/platform/billing/accounts/${organizationId}`, { headers });
    const result = (await response.json()) as AccountDetailResponse;
    if (!response.ok || !result.success) {
      toast.error(result.message ?? "Failed to load billing account.");
      return;
    }
    applyAccountDetail(result);
  }

  useEffect(() => {
    async function load() {
      const headers = await authHeader();
      if (!headers) {
        setLoading(false);
        toast.error("Session expired. Please sign in again.");
        return;
      }
      const response = await fetch(`/api/platform/billing/accounts/${organizationId}`, { headers });
      const result = (await response.json()) as AccountDetailResponse;
      setLoading(false);
      if (!response.ok || !result.success) {
        toast.error(result.message ?? "Failed to load billing account.");
        return;
      }
      applyAccountDetail(result);
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  async function markPaid(invoiceId: string) {
    setMarkingPaidId(invoiceId);
    const headers = await authHeader();
    if (!headers) { setMarkingPaidId(null); return; }
    const response = await fetch(`/api/platform/billing/invoices/${invoiceId}/mark-paid`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const result = (await response.json()) as { success: boolean; message?: string };
    setMarkingPaidId(null);
    if (!response.ok || !result.success) {
      toast.error(result.message ?? "Failed to mark invoice paid.");
      return;
    }
    toast.success("Invoice marked as paid.");
    void refresh();
  }

  async function submitInvoice() {
    if (!billingAccount) return;
    const parsedLineItems = lineItems
      .map((item) => ({ description: item.description.trim(), unitAmount: Number(item.unitAmount) }))
      .filter((item) => item.description && Number.isFinite(item.unitAmount) && item.unitAmount > 0);
    if (parsedLineItems.length === 0) {
      toast.error("Add at least one valid line item.");
      return;
    }
    setCreatingInvoice(true);
    const headers = await authHeader();
    if (!headers) { setCreatingInvoice(false); return; }
    const response = await fetch("/api/platform/billing/invoices", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        billingAccountId: billingAccount.id,
        invoiceCategory,
        invoiceSubtype,
        notes: notes.trim() || null,
        lineItems: parsedLineItems,
      }),
    });
    const result = (await response.json()) as { success: boolean; message?: string };
    setCreatingInvoice(false);
    if (!response.ok || !result.success) {
      toast.error(result.message ?? "Failed to create invoice.");
      return;
    }
    toast.success("Invoice created.");
    setLineItems([{ description: "", unitAmount: "" }]);
    setNotes("");
    setDialogOpen(false);
    void refresh();
  }

  async function openViewDialog(invoiceId: string) {
    const headers = await authHeader();
    if (!headers) return;
    const response = await fetch(`/api/platform/billing/invoices/${invoiceId}`, { headers });
    const result = (await response.json()) as { success: boolean; message?: string; invoice?: Invoice; lineItems?: InvoiceLineItem[] };
    if (!response.ok || !result.success || !result.invoice) {
      toast.error(result.message ?? "Failed to load invoice.");
      return;
    }
    setViewingInvoice(result.invoice);
    setViewingLineItems(result.lineItems ?? []);
  }

  async function openEditDialog(invoiceId: string) {
    const headers = await authHeader();
    if (!headers) return;
    const response = await fetch(`/api/platform/billing/invoices/${invoiceId}`, { headers });
    const result = (await response.json()) as { success: boolean; message?: string; invoice?: Invoice; lineItems?: InvoiceLineItem[] };
    if (!response.ok || !result.success || !result.invoice) {
      toast.error(result.message ?? "Failed to load invoice.");
      return;
    }
    setEditingInvoiceId(result.invoice.id);
    setEditCategory(result.invoice.invoice_category as (typeof INVOICE_CATEGORIES)[number]);
    setEditSubtype(result.invoice.invoice_subtype as (typeof INVOICE_SUBTYPES)[number]);
    setEditNotes(result.invoice.notes ?? "");
    setEditLineItems(
      (result.lineItems ?? []).map((item) => ({ description: item.description, unitAmount: String(item.unit_amount) }))
    );
  }

  async function submitEdit() {
    if (!editingInvoiceId) return;
    const parsedLineItems = editLineItems
      .map((item) => ({ description: item.description.trim(), unitAmount: Number(item.unitAmount) }))
      .filter((item) => item.description && Number.isFinite(item.unitAmount) && item.unitAmount > 0);
    if (parsedLineItems.length === 0) {
      toast.error("Add at least one valid line item.");
      return;
    }
    setSavingEdit(true);
    const headers = await authHeader();
    if (!headers) { setSavingEdit(false); return; }
    const response = await fetch(`/api/platform/billing/invoices/${editingInvoiceId}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        invoiceCategory: editCategory,
        invoiceSubtype: editSubtype,
        notes: editNotes.trim() || null,
        lineItems: parsedLineItems,
      }),
    });
    const result = (await response.json()) as { success: boolean; message?: string };
    setSavingEdit(false);
    if (!response.ok || !result.success) {
      toast.error(result.message ?? "Failed to update invoice.");
      return;
    }
    toast.success("Invoice updated.");
    setEditingInvoiceId(null);
    void refresh();
  }

  async function sendInvoice(invoiceId: string) {
    setSendingInvoiceId(invoiceId);
    const headers = await authHeader();
    if (!headers) { setSendingInvoiceId(null); return; }
    const response = await fetch(`/api/platform/billing/invoices/${invoiceId}/send`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const result = (await response.json()) as { success: boolean; message?: string };
    setSendingInvoiceId(null);
    if (!response.ok || !result.success) {
      toast.error(result.message ?? "Failed to send invoice.");
      return;
    }
    toast.success("Invoice sent — now visible to the organization.");
    void refresh();
  }

  async function voidInvoiceAction(invoiceId: string) {
    setVoidingInvoiceId(invoiceId);
    const headers = await authHeader();
    if (!headers) { setVoidingInvoiceId(null); return; }
    const response = await fetch(`/api/platform/billing/invoices/${invoiceId}/void`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const result = (await response.json()) as { success: boolean; message?: string };
    setVoidingInvoiceId(null);
    if (!response.ok || !result.success) {
      toast.error(result.message ?? "Failed to void invoice.");
      return;
    }
    toast.success("Invoice voided.");
    void refresh();
  }

  async function toggleArchive(campaignId: string, action: "archive" | "unarchive") {
    setArchivingCampaignId(campaignId);
    const headers = await authHeader();
    if (!headers) { setArchivingCampaignId(null); return; }
    const response = await fetch(`/api/platform/campaigns/${campaignId}/archive`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const result = (await response.json()) as { success: boolean; message?: string };
    setArchivingCampaignId(null);
    if (!response.ok || !result.success) {
      toast.error(result.message ?? `Failed to ${action} campaign.`);
      return;
    }
    toast.success(action === "archive" ? "Campaign archived." : "Campaign restored to completed.");
    void refresh();
  }

  async function setGatingOverride(value: boolean | null) {
    setSavingGatingOverride(true);
    const headers = await authHeader();
    if (!headers) { setSavingGatingOverride(false); return; }
    const response = await fetch(`/api/platform/billing/accounts/${organizationId}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ gatingOverride: value }),
    });
    const result = (await response.json()) as { success: boolean; message?: string };
    setSavingGatingOverride(false);
    if (!response.ok || !result.success) {
      toast.error(result.message ?? "Failed to update activation gate override.");
      return;
    }
    toast.success("Activation gate override updated.");
    void refresh();
  }

  if (loading) return <div className="rounded-3xl border border-border p-4 text-sm text-muted-foreground">Loading billing account...</div>;
  if (!organization || !billingAccount) {
    return <div className="rounded-3xl border border-border p-4 text-sm text-muted-foreground">No billing account found for this organization.</div>;
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/10">
              {toTitleCase(billingAccount.account_status)}
            </Badge>
            <span className="text-sm text-muted-foreground">{organization.slug}</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">{organization.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Implementation fee: {toTitleCase(billingAccount.implementation_fee_status)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="rounded-full" asChild>
            <Link href={`/super-admin/organizations/${organization.id}`}>Organization Overview</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <Stat label="Outstanding balance" value={formatAmount(outstandingAmount, billingAccount.default_currency)} />
        <Stat label="Invoices" value={String(invoices.length)} />
        <Stat label="Infrastructure allocations" value={String(allocations.length)} />
      </div>

      <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <h2 className="font-semibold">Commercial Activation Gate</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Overrides the global <code>commercial.activation.enabled</code> flag for this organization only. Use this to test the gate against a single org without affecting anyone else.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <Select
            value={billingAccount.gating_override === true ? "true" : billingAccount.gating_override === false ? "false" : "inherit"}
            onValueChange={(v) => void setGatingOverride(v === "inherit" ? null : v === "true")}
            disabled={savingGatingOverride}
          >
            <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="inherit">Inherit global default</SelectItem>
              <SelectItem value="true">Force enabled (test this org)</SelectItem>
              <SelectItem value="false">Force disabled</SelectItem>
            </SelectContent>
          </Select>
          <Badge className="rounded-full bg-muted text-muted-foreground hover:bg-muted">
            Currently: {billingAccount.gating_override === true ? "Forced On" : billingAccount.gating_override === false ? "Forced Off" : "Inherits Global"}
          </Badge>
        </div>
      </section>

      <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">Invoices</h2>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-full">Create Invoice</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create invoice</DialogTitle>
                <DialogDescription>Manual invoice, tracked to payment via bank transfer or manual approval.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Category</label>
                    <Select value={invoiceCategory} onValueChange={(v) => setInvoiceCategory(v as typeof invoiceCategory)}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {INVOICE_CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>{toTitleCase(c)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Type</label>
                    <Select value={invoiceSubtype} onValueChange={(v) => setInvoiceSubtype(v as typeof invoiceSubtype)}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {INVOICE_SUBTYPES.map((s) => (
                          <SelectItem key={s} value={s}>{toTitleCase(s)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Line items</label>
                  {lineItems.map((item, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        placeholder="Description"
                        value={item.description}
                        onChange={(e) => setLineItems((prev) => prev.map((li, i) => (i === index ? { ...li, description: e.target.value } : li)))}
                      />
                      <Input
                        placeholder="Amount"
                        type="number"
                        className="w-32"
                        value={item.unitAmount}
                        onChange={(e) => setLineItems((prev) => prev.map((li, i) => (i === index ? { ...li, unitAmount: e.target.value } : li)))}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-full px-3"
                        onClick={() => setLineItems((prev) => prev.filter((_, i) => i !== index))}
                        disabled={lineItems.length === 1}
                      >
                        ×
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full"
                    onClick={() => setLineItems((prev) => [...prev, { description: "", unitAmount: "" }])}
                  >
                    Add line item
                  </Button>
                </div>

                <Textarea placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline" className="rounded-full">Cancel</Button>
                </DialogClose>
                <Button className="rounded-full" disabled={creatingInvoice} onClick={() => void submitInvoice()}>
                  {creatingInvoice ? "Creating…" : "Create Invoice"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

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
                  <th className="px-3 py-2 text-left font-medium">Created</th>
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
                    <td className="px-3 py-3 text-muted-foreground">{new Date(invoice.created_at).toLocaleDateString()}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" className="rounded-full" onClick={() => void openViewDialog(invoice.id)}>
                          View
                        </Button>
                        {invoice.status === "draft" ? (
                          <>
                            <Button variant="outline" className="rounded-full" onClick={() => void openEditDialog(invoice.id)}>
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              className="rounded-full"
                              disabled={sendingInvoiceId === invoice.id}
                              onClick={() => void sendInvoice(invoice.id)}
                            >
                              {sendingInvoiceId === invoice.id ? "Working…" : "Send"}
                            </Button>
                          </>
                        ) : null}
                        {invoice.status === "sent" || invoice.status === "overdue" ? (
                          <Button
                            variant="outline"
                            className="rounded-full"
                            disabled={markingPaidId === invoice.id}
                            onClick={() => void markPaid(invoice.id)}
                          >
                            {markingPaidId === invoice.id ? "Working…" : "Mark Paid"}
                          </Button>
                        ) : null}
                        {invoice.status !== "paid" && invoice.status !== "void" ? (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="outline"
                                className="rounded-full text-destructive hover:text-destructive"
                                disabled={voidingInvoiceId === invoice.id}
                              >
                                {voidingInvoiceId === invoice.id ? "Working…" : "Void"}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Void this invoice?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  The invoice stays on record for audit purposes but is permanently marked void — it can&apos;t be paid or edited afterward, and this can&apos;t be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() => void voidInvoiceAction(invoice.id)}
                                >
                                  Void Invoice
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

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

      <Dialog open={Boolean(editingInvoiceId)} onOpenChange={(open) => { if (!open) setEditingInvoiceId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit invoice</DialogTitle>
            <DialogDescription>Only draft invoices can be edited — once sent, this record is fixed.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-muted-foreground">Category</label>
                <Select value={editCategory} onValueChange={(v) => setEditCategory(v as typeof editCategory)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INVOICE_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{toTitleCase(c)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Type</label>
                <Select value={editSubtype} onValueChange={(v) => setEditSubtype(v as typeof editSubtype)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INVOICE_SUBTYPES.map((s) => (
                      <SelectItem key={s} value={s}>{toTitleCase(s)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Line items</label>
              {editLineItems.map((item, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    placeholder="Description"
                    value={item.description}
                    onChange={(e) => setEditLineItems((prev) => prev.map((li, i) => (i === index ? { ...li, description: e.target.value } : li)))}
                  />
                  <Input
                    placeholder="Amount"
                    type="number"
                    className="w-32"
                    value={item.unitAmount}
                    onChange={(e) => setEditLineItems((prev) => prev.map((li, i) => (i === index ? { ...li, unitAmount: e.target.value } : li)))}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full px-3"
                    onClick={() => setEditLineItems((prev) => prev.filter((_, i) => i !== index))}
                    disabled={editLineItems.length === 1}
                  >
                    ×
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => setEditLineItems((prev) => [...prev, { description: "", unitAmount: "" }])}
              >
                Add line item
              </Button>
            </div>

            <Textarea placeholder="Notes (optional)" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" className="rounded-full">Cancel</Button>
            </DialogClose>
            <Button className="rounded-full" disabled={savingEdit} onClick={() => void submitEdit()}>
              {savingEdit ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
          <h2 className="font-semibold">Campaign Activations</h2>
          {activations.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No campaigns yet.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {activations.map((activation) => {
                const campaignId = activation.campaigns?.id;
                const campaignStatus = activation.campaigns?.status;
                return (
                  <div key={activation.id} className="flex items-center justify-between gap-3 rounded-2xl bg-muted/35 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{activation.campaigns?.name ?? "-"}</p>
                      <p className="text-xs text-muted-foreground">{toTitleCase(campaignStatus ?? "-")}</p>
                    </div>
                    <Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/10">
                      {toTitleCase(activation.activation_status)}
                    </Badge>
                    {campaignId && campaignStatus === "completed" ? (
                      <Button
                        variant="outline"
                        className="rounded-full"
                        disabled={archivingCampaignId === campaignId}
                        onClick={() => void toggleArchive(campaignId, "archive")}
                      >
                        {archivingCampaignId === campaignId ? "Working…" : "Archive Now"}
                      </Button>
                    ) : null}
                    {campaignId && campaignStatus === "archived" ? (
                      <Button
                        variant="outline"
                        className="rounded-full"
                        disabled={archivingCampaignId === campaignId}
                        onClick={() => void toggleArchive(campaignId, "unarchive")}
                      >
                        {archivingCampaignId === campaignId ? "Working…" : "Un-archive"}
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
          <h2 className="font-semibold">Infrastructure Allocations</h2>
          {allocations.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No allocations recorded.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {allocations.map((allocation) => (
                <div key={allocation.id} className="flex items-center justify-between rounded-2xl bg-muted/35 px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium">{toTitleCase(allocation.allocation_type)}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(allocation.starts_at).toLocaleDateString()}
                      {allocation.ends_at ? ` – ${new Date(allocation.ends_at).toLocaleDateString()}` : " – ongoing"}
                    </p>
                  </div>
                  <Badge className="rounded-full bg-muted text-muted-foreground hover:bg-muted">
                    {toTitleCase(allocation.status)}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.6rem] bg-card p-5 shadow-sm ring-1 ring-border/60">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </div>
  );
}
