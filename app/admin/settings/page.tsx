"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import InstallAppButton from "@/components/pwa/InstallAppButton";
import { authorizedFetch } from "@/lib/api/client";

type Settings = {
  id: string;
  name: string;
  industry: string | null;
  primary_contact_email: string | null;
  support_phone: string | null;
  campaign_default_type: string | null;
  default_target_per_rep: number | null;
  require_photo_evidence: boolean;
  require_gps_capture: boolean;
  offline_capture_enabled: boolean;
};

export default function SettingsPage() {
  const [saving, setSaving] = useState(false);
  const query = useQuery({
    queryKey: ["admin-settings"],
    queryFn: async () => (await authorizedFetch<{ success: boolean; settings: Settings }>("/api/admin/settings")).settings,
  });

  if (query.isLoading) {
    return (
      <div className="rounded-4xl bg-card p-8 shadow-sm ring-1 ring-border/60">
        <div className="space-y-4">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-72" />
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        </div>
      </div>
    );
  }
  if (!query.data) return <div className="rounded-4xl bg-card p-10 text-center ring-1 ring-border/60">Settings unavailable.</div>;

  const settings = query.data;

  async function save(formData: FormData) {
    setSaving(true);
    try {
      await authorizedFetch<{ success: boolean }>("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationName: String(formData.get("organizationName") ?? ""),
          industry: String(formData.get("industry") ?? "") || null,
          contactEmail: String(formData.get("contactEmail") ?? "") || null,
          supportPhone: String(formData.get("supportPhone") ?? "") || null,
          campaignDefaultType: String(formData.get("campaignDefaultType") ?? "") || null,
          defaultTargetPerRep: Number(formData.get("defaultTargetPerRep") || 0) || null,
          requirePhotoEvidence: formData.get("requirePhotoEvidence") === "on",
          requireGpsCapture: formData.get("requireGpsCapture") === "on",
          offlineCaptureEnabled: formData.get("offlineCaptureEnabled") === "on",
        }),
      });
      toast.success("Settings saved.");
      query.refetch();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">Organization profile, user management, and campaign defaults.</p>
        </div>
      </div>

      <section className="rounded-4xl bg-card p-6 shadow-sm ring-1 ring-border/60">
        <h2 className="text-lg font-semibold">Organizational User Management</h2>
        <p className="mt-1 text-sm text-muted-foreground">Manage admins, supervisors, and agents directly from here.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" className="rounded-full" asChild>
            <Link href="/admin/users">View Users</Link>
          </Button>
          <Button className="rounded-full" asChild>
            <Link href="/admin/users/new">Invite User</Link>
          </Button>
          <InstallAppButton className="rounded-full" />
        </div>
      </section>

      <form
        className="rounded-4xl bg-card p-6 shadow-sm ring-1 ring-border/60 space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          void save(new FormData(event.currentTarget));
        }}
      >
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Organization name"><Input name="organizationName" defaultValue={settings.name} /></Field>
          <Field label="Industry"><Input name="industry" defaultValue={settings.industry ?? ""} /></Field>
          <Field label="Contact email"><Input name="contactEmail" type="email" defaultValue={settings.primary_contact_email ?? ""} /></Field>
          <Field label="Support phone"><Input name="supportPhone" defaultValue={settings.support_phone ?? ""} /></Field>
          <Field label="Default campaign type"><Input name="campaignDefaultType" defaultValue={settings.campaign_default_type ?? ""} /></Field>
          <Field label="Default target per rep"><Input name="defaultTargetPerRep" type="number" defaultValue={settings.default_target_per_rep ?? ""} /></Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Check name="requirePhotoEvidence" label="Require photo evidence" defaultChecked={settings.require_photo_evidence} />
          <Check name="requireGpsCapture" label="Require GPS capture" defaultChecked={settings.require_gps_capture} />
          <Check name="offlineCaptureEnabled" label="Offline capture enabled" defaultChecked={settings.offline_capture_enabled} />
        </div>

        <div className="rounded-3xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          Payment defaults and advanced SKU catalog are not persisted yet. These will be enabled in a follow-up schema/API release.
        </div>

        <div className="flex justify-end">
          <Button className="rounded-full px-6" disabled={saving}>{saving ? "Saving..." : "Save Changes"}</Button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="space-y-2 block"><span className="text-sm font-medium">{label}</span>{children}</label>;
}

function Check({ name, label, defaultChecked }: { name: string; label: string; defaultChecked: boolean }) {
  return (
    <label className="flex items-center gap-2 rounded-2xl bg-muted/35 px-4 py-3 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} />
      <span>{label}</span>
    </label>
  );
}
