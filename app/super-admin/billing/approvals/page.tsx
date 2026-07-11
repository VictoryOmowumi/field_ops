"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import { supabaseClient } from "@/lib/supabase/client";

type ActivationRow = {
  id: string;
  campaign_id: string;
  billing_account_id: string;
  activation_status: string;
  created_at: string;
  campaigns: { id: string; name: string; organization_id: string; status: string } | null;
};

async function authHeader() {
  const { data } = await supabaseClient.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : null;
}

export default function CampaignActivationApprovalsPage() {
  const [activations, setActivations] = useState<ActivationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});

  useEffect(() => {
    async function load() {
      const headers = await authHeader();
      if (!headers) {
        setLoading(false);
        toast.error("Session expired. Please sign in again.");
        return;
      }
      const response = await fetch("/api/platform/billing/activations?status=pending_approval", { headers });
      const result = (await response.json()) as { success: boolean; message?: string; activations?: ActivationRow[] };
      setLoading(false);
      if (!response.ok || !result.success) {
        toast.error(result.message ?? "Failed to load approval queue.");
        return;
      }
      setActivations(result.activations ?? []);
    }
    void load();
  }, []);

  async function approve(id: string) {
    setBusyId(id);
    const headers = await authHeader();
    if (!headers) { setBusyId(null); return; }
    const response = await fetch(`/api/platform/billing/activations/${id}/approve`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const result = (await response.json()) as { success: boolean; message?: string };
    setBusyId(null);
    if (!response.ok || !result.success) {
      toast.error(result.message ?? "Failed to approve activation.");
      return;
    }
    toast.success("Campaign activation approved.");
    setActivations((prev) => prev.filter((a) => a.id !== id));
  }

  async function reject(id: string) {
    const reason = rejectReason[id]?.trim();
    if (!reason) {
      toast.error("A rejection reason is required.");
      return;
    }
    setBusyId(id);
    const headers = await authHeader();
    if (!headers) { setBusyId(null); return; }
    const response = await fetch(`/api/platform/billing/activations/${id}/reject`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    const result = (await response.json()) as { success: boolean; message?: string };
    setBusyId(null);
    if (!response.ok || !result.success) {
      toast.error(result.message ?? "Failed to reject activation.");
      return;
    }
    toast.success("Campaign activation rejected.");
    setActivations((prev) => prev.filter((a) => a.id !== id));
  }

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Campaign Activation Approvals</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every new campaign lands here awaiting commercial approval before it can go active.
        </p>
      </div>

      <section className="overflow-hidden rounded-3xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Campaign</th>
              <th className="px-4 py-3 text-left font-medium">Requested</th>
              <th className="px-4 py-3 text-left font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className="border-t border-border">
                <td className="px-4 py-6 text-muted-foreground" colSpan={3}>Loading approval queue...</td>
              </tr>
            ) : activations.length === 0 ? (
              <tr className="border-t border-border">
                <td className="px-4 py-6 text-muted-foreground" colSpan={3}>Nothing awaiting approval.</td>
              </tr>
            ) : (
              activations.map((activation) => (
                <tr key={activation.id} className="border-t border-border align-top">
                  <td className="px-4 py-4">
                    <p className="font-medium">{activation.campaigns?.name ?? "-"}</p>
                    <Link
                      href={`/super-admin/billing/${activation.campaigns?.organization_id ?? ""}`}
                      className="text-xs text-primary hover:underline"
                    >
                      View organization billing
                    </Link>
                  </td>
                  <td className="px-4 py-4 text-muted-foreground">
                    {new Date(activation.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        className="rounded-full"
                        disabled={busyId === activation.id}
                        onClick={() => void approve(activation.id)}
                      >
                        {busyId === activation.id ? "Working…" : "Approve"}
                      </Button>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" className="rounded-full" disabled={busyId === activation.id}>
                            Reject
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Reject {activation.campaigns?.name ?? "this campaign"}?</DialogTitle>
                            <DialogDescription>
                              This blocks the campaign from going active until it&apos;s resubmitted and approved. Give a reason so the org understands what to fix.
                            </DialogDescription>
                          </DialogHeader>
                          <Textarea
                            placeholder="Reason for rejection"
                            value={rejectReason[activation.id] ?? ""}
                            onChange={(e) => setRejectReason((prev) => ({ ...prev, [activation.id]: e.target.value }))}
                          />
                          <DialogFooter>
                            <DialogClose asChild>
                              <Button variant="outline" className="rounded-full">Cancel</Button>
                            </DialogClose>
                            <DialogClose asChild>
                              <Button
                                className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => void reject(activation.id)}
                              >
                                Reject Activation
                              </Button>
                            </DialogClose>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
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
