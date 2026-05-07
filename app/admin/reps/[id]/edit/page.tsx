"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
import { authorizedFetch } from "@/lib/api/client";

type Rep = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  state: string | null;
  lga: string | null;
  targetOutlets: number | null;
  targetConversions: number | null;
  assignedSupervisorUserId: string | null;
  notes: string | null;
  status: "active" | "inactive" | "suspended";
  campaignIds: string[];
  bankName?: string | null;
  accountNumber?: string | null;
  accountName?: string | null;
  paymentType?: "daily_rate" | "commission" | "daily_plus_commission" | null;
  dailyRate?: number | null;
  commissionRate?: number | null;
};
type Campaign = { id: string; name: string; status: string };
type User = { id: string; displayName: string; organizationRole: string };

export default function EditRepPage() {
  const params = useParams<{ id: string }>();
  const repId = params.id;

  const repQuery = useQuery({
    queryKey: ["rep-edit", repId],
    queryFn: async () => (await authorizedFetch<{ success: boolean; rep: Rep }>(`/api/admin/reps/${repId}`)).rep,
  });
  const campaignsQuery = useQuery({
    queryKey: ["campaigns-select"],
    queryFn: async () => (await authorizedFetch<{ success: boolean; campaigns: Campaign[] }>("/api/admin/campaigns")).campaigns ?? [],
  });
  const usersQuery = useQuery({
    queryKey: ["users-select"],
    queryFn: async () => (await authorizedFetch<{ success: boolean; users: User[] }>("/api/admin/users")).users ?? [],
  });

  if (repQuery.isLoading) return <div className="rounded-4xl bg-card p-10 text-center ring-1 ring-border/60">Loading...</div>;
  if (!repQuery.data) return <div className="rounded-4xl bg-card p-10 text-center ring-1 ring-border/60">Rep not found.</div>;

  return (
    <RepEditForm
      key={repQuery.data.id}
      rep={repQuery.data}
      campaigns={campaignsQuery.data ?? []}
      users={usersQuery.data ?? []}
    />
  );
}

function RepEditForm({ rep, campaigns, users }: { rep: Rep; campaigns: Campaign[]; users: User[] }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [assignedSupervisorUserId, setAssignedSupervisorUserId] = useState(rep.assignedSupervisorUserId ?? "none");
  const [targetOutlets, setTargetOutlets] = useState(rep.targetOutlets?.toString() ?? "");
  const [targetConversions, setTargetConversions] = useState(rep.targetConversions?.toString() ?? "");
  const [status, setStatus] = useState<"active" | "inactive" | "suspended">(rep.status);
  const [notes, setNotes] = useState(rep.notes ?? "");
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>(rep.campaignIds);
  const [bankName, setBankName] = useState(rep.bankName ?? "");
  const [accountNumber, setAccountNumber] = useState(rep.accountNumber ?? "");
  const [accountName, setAccountName] = useState(rep.accountName ?? "");
  const [paymentType, setPaymentType] = useState(rep.paymentType ?? "");
  const [dailyRate, setDailyRate] = useState(rep.dailyRate?.toString() ?? "");
  const [commissionRate, setCommissionRate] = useState(rep.commissionRate?.toString() ?? "");

  const supervisors = users.filter((u) => u.organizationRole === "supervisor" || u.organizationRole === "org_admin");

  async function save() {
    setSaving(true);
    try {
      await authorizedFetch<{ success: boolean }>(`/api/admin/reps/${rep.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetOutlets: targetOutlets ? Number(targetOutlets) : null,
          targetConversions: targetConversions ? Number(targetConversions) : null,
          assignedSupervisorUserId: assignedSupervisorUserId === "none" ? null : assignedSupervisorUserId,
          notes: notes || null,
          status,
          campaignIds: selectedCampaignIds,
          bankName: bankName || null,
          accountNumber: accountNumber || null,
          accountName: accountName || null,
          paymentType: (paymentType || null) as "daily_rate" | "commission" | "daily_plus_commission" | null,
          dailyRate: dailyRate ? Number(dailyRate) : null,
          commissionRate: commissionRate ? Number(commissionRate) : null,
        }),
      });
      toast.success("Rep updated.");
      router.push(`/admin/reps/${rep.id}`);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Edit Sales Rep</h1>
          <p className="mt-1 text-sm text-muted-foreground">Update rep profile and assignments.</p>
        </div>
        <Button variant="outline" className="rounded-full" asChild><Link href={`/admin/reps/${rep.id}`}>Cancel</Link></Button>
      </div>

      <section className="rounded-4xl bg-card p-6 shadow-sm ring-1 ring-border/60 space-y-5">
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Full name"><Input value={rep.fullName} disabled /></Field>
          <Field label="Email"><Input value={rep.email ?? ""} disabled /></Field>
          <Field label="Phone"><Input value={rep.phone ?? ""} disabled /></Field>
          <Field label="Territory"><Input value={[rep.lga, rep.state].filter(Boolean).join(", ")} disabled /></Field>
          <Field label="Assigned supervisor">
            <Select value={assignedSupervisorUserId} onValueChange={setAssignedSupervisorUserId}>
              <SelectTrigger><SelectValue placeholder="Select supervisor" /></SelectTrigger>
              <SelectContent><SelectItem value="none">None</SelectItem>{supervisors.map((s) => <SelectItem key={s.id} value={s.id}>{s.displayName}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Status">
            <Select value={status} onValueChange={(value: "active" | "inactive" | "suspended") => setStatus(value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem><SelectItem value="suspended">Suspended</SelectItem></SelectContent>
            </Select>
          </Field>
          <Field label="Target outlets"><Input type="number" value={targetOutlets} onChange={(e) => setTargetOutlets(e.target.value)} /></Field>
          <Field label="Target conversions"><Input type="number" value={targetConversions} onChange={(e) => setTargetConversions(e.target.value)} /></Field>
          <div className="space-y-1">
            <p className="text-sm font-medium">Assigned campaigns (multi-select)</p>
            <Combobox
              items={campaigns.map((campaign) => campaign.id)}
              multiple
              value={selectedCampaignIds}
              onValueChange={setSelectedCampaignIds}
            >
              <ComboboxChips>
                <ComboboxValue>
                  {selectedCampaignIds.map((id) => {
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
                <ComboboxList>
                  {(id) => {
                    const match = campaigns.find((campaign) => campaign.id === id);
                    return (
                      <ComboboxItem key={id} value={id}>
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
              <Select value={bankName} onValueChange={setBankName}>
                <SelectTrigger><SelectValue placeholder="Select bank" /></SelectTrigger>
                <SelectContent>{nigerianBankOptions.map((bank) => <SelectItem key={bank} value={bank}>{bank}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Account number"><Input inputMode="numeric" placeholder="0123456789" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} /></Field>
            <Field label="Account name"><Input placeholder="Auto-confirmed or entered manually" value={accountName} onChange={(e) => setAccountName(e.target.value)} /></Field>
            <Field label="Payment type">
              <Select value={paymentType} onValueChange={setPaymentType}>
                <SelectTrigger><SelectValue placeholder="Select payment type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily_rate">Daily Rate</SelectItem>
                  <SelectItem value="commission">Commission</SelectItem>
                  <SelectItem value="daily_plus_commission">Daily + Commission</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Daily rate"><Input type="number" placeholder="10000" value={dailyRate} onChange={(e) => setDailyRate(e.target.value)} /></Field>
            <Field label="Commission rate (%)"><Input type="number" placeholder="5" value={commissionRate} onChange={(e) => setCommissionRate(e.target.value)} /></Field>
          </div>
        </section>


        <Field label="Notes"><Textarea className="min-h-24" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <div className="flex justify-end"><Button className="rounded-full px-6" disabled={saving} onClick={save}>{saving ? "Saving..." : "Save Changes"}</Button></div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="space-y-2 block"><span className="text-sm font-medium">{label}</span>{children}</label>;
}
