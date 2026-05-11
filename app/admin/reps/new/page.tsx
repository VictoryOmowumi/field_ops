"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
} from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { nigerianBankOptions } from "@/data/nigerian-banks";
import { nigeriaLocations } from "@/data/nigeria-locations";
import { authorizedFetch } from "@/lib/api/client";
import {
  buildCreateRepPayload,
  createDefaultRepFormValues,
  type RepFormValues,
  validateRepForm,
} from "@/lib/admin/rep-form";

type Campaign = { id: string; name: string; status: string };
type User = { id: string; displayName: string; organizationRole: string };

export default function NewRepPage() {
  const router = useRouter();
  const [form, setForm] = useState<RepFormValues>(createDefaultRepFormValues);
  const [creating, setCreating] = useState(false);

  const location = useMemo(() => nigeriaLocations.find((item) => item.state === form.selectedState), [form.selectedState]);

  const campaignsQuery = useQuery({
    queryKey: ["campaigns-select"],
    queryFn: async () => {
      const result = await authorizedFetch<{ success: boolean; campaigns: Campaign[] }>("/api/admin/campaigns");
      return result.campaigns ?? [];
    },
  });

  const usersQuery = useQuery({
    queryKey: ["users-select"],
    queryFn: async () => {
      const result = await authorizedFetch<{ success: boolean; users: User[] }>("/api/admin/users");
      return result.users ?? [];
    },
  });

  const supervisors = useMemo(
    () => (usersQuery.data ?? []).filter((u) => u.organizationRole === "supervisor" || u.organizationRole === "org_admin"),
    [usersQuery.data]
  );
  const campaigns = useMemo(() => (campaignsQuery.data ?? []).filter((c) => c.status !== "completed"), [campaignsQuery.data]);

  async function createRep() {
    const validationError = validateRepForm(form);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setCreating(true);
    try {
      const result = await authorizedFetch<{ success: boolean; rep: { id: string } }>("/api/admin/reps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildCreateRepPayload(form)),
      });
      toast.success("Rep invited and created.");
      router.push(`/admin/reps/${result.rep.id}`);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Add Sales Rep</h1>
          <p className="mt-1 text-sm text-muted-foreground">Register a field agent and assign campaigns.</p>
        </div>
        <Button variant="outline" className="rounded-full" asChild><Link href="/admin/reps">Cancel</Link></Button>
      </div>

      <section className="rounded-4xl bg-card p-6 shadow-sm ring-1 ring-border/60 space-y-5">
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Full name"><Input value={form.fullName} onChange={(e) => setForm((prev) => ({ ...prev, fullName: e.target.value }))} /></Field>
          <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))} /></Field>
          <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} /></Field>
          <Field label="Assigned supervisor">
            <Select value={form.assignedSupervisorUserId} onValueChange={(value) => setForm((prev) => ({ ...prev, assignedSupervisorUserId: value }))}>
              <SelectTrigger><SelectValue placeholder="Select supervisor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {supervisors.map((s) => <SelectItem key={s.id} value={s.id}>{s.displayName}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="State">
            <Select value={form.selectedState} onValueChange={(value) => setForm((prev) => ({ ...prev, selectedState: value, selectedLga: "" }))}>
              <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
              <SelectContent>{nigeriaLocations.map((n) => <SelectItem key={n.state} value={n.state}>{n.state}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="LGA">
            <Select value={form.selectedLga} onValueChange={(value) => setForm((prev) => ({ ...prev, selectedLga: value }))} disabled={!form.selectedState}>
              <SelectTrigger><SelectValue placeholder="Select LGA" /></SelectTrigger>
              <SelectContent>{location?.lgas.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Target outlets"><Input type="number" value={form.targetOutlets} onChange={(e) => setForm((prev) => ({ ...prev, targetOutlets: e.target.value }))} /></Field>
          <Field label="Target conversions"><Input type="number" value={form.targetConversions} onChange={(e) => setForm((prev) => ({ ...prev, targetConversions: e.target.value }))} /></Field>
          <div className="space-y-1">
            <p className="text-sm font-medium">Assign campaigns (multi-select)</p>
          
            <Combobox
              items={campaigns.map((campaign) => campaign.id)}
              multiple
              value={form.selectedCampaignIds}
              onValueChange={(value) => setForm((prev) => ({ ...prev, selectedCampaignIds: value }))}
            >
              <ComboboxChips>
                <ComboboxValue>
                  {form.selectedCampaignIds.map((id) => {
                    const match = campaigns.find((campaign) => campaign.id === id);
                    return <ComboboxChip key={id}>{match?.name ?? id}</ComboboxChip>;
                  })}
                </ComboboxValue>
                <ComboboxChipsInput placeholder="Assign campaign..." />
              </ComboboxChips>
              <ComboboxContent>
                {campaigns.length === 0 ? (
                  <ComboboxEmpty>No campaigns found.</ComboboxEmpty>
                ) : null}
                <ComboboxList >
                  {(id) => {
                    const match = campaigns.find((campaign) => campaign.id === id);
                    return (
                      <ComboboxItem key={id} value={id} >
                        {match?.name ?? id}
                      </ComboboxItem>
                    );
                  }}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
         
          </div>
        </div>


        <section className="rounded-3xl border border-border/70 p-4">
          <h3 className="font-medium">Payment Information</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Banking details are only visible to authorized admins.
          </p>
          <div className="mt-4 grid gap-5 md:grid-cols-2">
            <Field label="Bank name">
              <Select value={form.bankName} onValueChange={(value) => setForm((prev) => ({ ...prev, bankName: value }))}>
                <SelectTrigger><SelectValue placeholder="Select bank" /></SelectTrigger>
                <SelectContent>{nigerianBankOptions.map((bank) => <SelectItem key={bank} value={bank}>{bank}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Account number"><Input inputMode="numeric" placeholder="0123456789" value={form.accountNumber} onChange={(e) => setForm((prev) => ({ ...prev, accountNumber: e.target.value }))} /></Field>
            <Field label="Account name"><Input placeholder="Auto-confirmed or entered manually" value={form.accountName} onChange={(e) => setForm((prev) => ({ ...prev, accountName: e.target.value }))} /></Field>
            <Field label="Payment type">
              <Select value={form.paymentType} onValueChange={(value) => setForm((prev) => ({ ...prev, paymentType: value }))}>
                <SelectTrigger><SelectValue placeholder="Select payment type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily_rate">Daily Rate</SelectItem>
                  <SelectItem value="commission">Commission</SelectItem>
                  <SelectItem value="daily_plus_commission">Daily + Commission</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Daily rate"><Input type="number" placeholder="10000" value={form.dailyRate} onChange={(e) => setForm((prev) => ({ ...prev, dailyRate: e.target.value }))} /></Field>
            <Field label="Commission rate (%)"><Input type="number" placeholder="5" value={form.commissionRate} onChange={(e) => setForm((prev) => ({ ...prev, commissionRate: e.target.value }))} /></Field>
          </div>
        </section>

        <Field label="Notes"><Textarea className="min-h-24" value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} /></Field>

        <div className="flex justify-end">
          <Button className="rounded-full px-6" disabled={creating} onClick={createRep}>
            {creating ? "Creating..." : "Create Rep"}
          </Button>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-2 block">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
