"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import ResendInviteButton from "@/components/super-admin/ResendInviteButton";

type Org = {
  id: string;
  name: string;
  slug: string;
  industry?: string | null;
  business_type?: string | null;
  website?: string | null;
  primary_contact_email?: string | null;
  primary_contact_phone?: string | null;
  country?: string | null;
  timezone?: string | null;
  currency?: string | null;
  status: string;
  plan?: string | null;
  brand_primary_color?: string | null;
  brand_secondary_color?: string | null;
  logo_url?: string | null;
  brand_favicon_ico_url?: string | null;
  brand_favicon_16_url?: string | null;
  brand_favicon_32_url?: string | null;
  brand_apple_touch_icon_url?: string | null;
  brand_android_192_url?: string | null;
  brand_android_512_url?: string | null;
  brand_manifest_url?: string | null;
  billing_email?: string | null;
  created_at: string;
  campaignCount: number;
  userCount: number;
  outletCount: number;
  salesCount: number;
  primaryAdminName?: string;
  primaryAdminEmail?: string;
  primaryAdminPhone?: string;
  storageUsage?: string;
  monthlyActivity?: string;
};

type Member = { id: string; name: string; role: string; status: string };

function titleCase(value: string | null | undefined) {
  if (!value) return "-";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function OrganizationDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const orgId = params.id;
  const [org, setOrg] = useState<Org | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [roleChanging, setRoleChanging] = useState<string | null>(null);
  const deleteInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function loadOrg() {
      const { data } = await supabaseClient.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const [orgRes, membersRes] = await Promise.all([
        fetch(`/api/platform/organizations/${orgId}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/platform/organizations/${orgId}/users`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const orgResult = (await orgRes.json()) as { success: boolean; message?: string; organization?: Org };
      const membersResult = (await membersRes.json()) as { success: boolean; users?: Member[] };
      if (!orgRes.ok || !orgResult.success || !orgResult.organization) {
        toast.error(orgResult.message ?? "Failed to load organization.");
        return;
      }
      setOrg(orgResult.organization);
      if (membersResult.success) setMembers(membersResult.users ?? []);
    }
    void loadOrg();
  }, [orgId]);

  async function confirmToggleSuspend() {
    if (!org) return;
    const next = org.status === "suspended" ? "active" : "suspended";
    setToggling(true);
    const { data } = await supabaseClient.auth.getSession();
    const token = data.session?.access_token;
    if (!token) { setToggling(false); return; }
    const res = await fetch(`/api/platform/organizations/${org.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: next }),
    });
    const result = (await res.json()) as { success: boolean; message?: string; organization?: Org };
    setToggling(false);
    if (!res.ok || !result.success) {
      toast.error(result.message ?? "Failed to update status.");
      return;
    }
    setOrg((prev) => prev ? { ...prev, status: next } : prev);
    toast.success(next === "suspended" ? `${org.name} has been suspended.` : `${org.name} has been reactivated.`);
  }

  async function confirmDelete() {
    if (!org || deleteInput !== org.name) return;
    setDeleting(true);
    const { data } = await supabaseClient.auth.getSession();
    const token = data.session?.access_token;
    if (!token) { setDeleting(false); return; }
    const res = await fetch(`/api/platform/organizations/${org.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = (await res.json()) as { success: boolean; message?: string };
    setDeleting(false);
    if (!res.ok || !result.success) {
      toast.error(result.message ?? "Failed to delete organization.");
      return;
    }
    toast.success(`${org.name} has been permanently deleted.`);
    router.replace("/super-admin/organizations");
  }

  async function changeRole(userId: string, role: string) {
    if (!org) return;
    setRoleChanging(userId);
    const { data } = await supabaseClient.auth.getSession();
    const token = data.session?.access_token;
    if (!token) { setRoleChanging(null); return; }
    const res = await fetch(`/api/platform/organizations/${org.id}/users`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ userId, role }),
    });
    const result = (await res.json()) as { success: boolean; message?: string };
    setRoleChanging(null);
    if (!res.ok || !result.success) {
      toast.error(result.message ?? "Failed to update role.");
      return;
    }
    setMembers((prev) => prev.map((m) => m.id === userId ? { ...m, role } : m));
    toast.success("Role updated.");
  }

  if (!org) return <div className="rounded-3xl border border-border p-4 text-sm text-muted-foreground">Loading organization...</div>;

  const orgStatus = titleCase(org.status);
  const orgPlan = titleCase(org.plan);

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/10">{orgStatus}</Badge>
            <span className="text-sm text-muted-foreground">{org.id}</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">{org.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{org.slug} · {org.industry ?? "-"} · {org.business_type ?? "-"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="rounded-full" asChild><Link href="/super-admin/organizations">Back</Link></Button>
          <Button variant="outline" className="rounded-full" asChild><Link href={`/super-admin/organizations/${org.id}/experience`}>Tenant Experience</Link></Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant={org.status === "suspended" ? "outline" : "destructive"}
                className="rounded-full"
                disabled={toggling}
              >
                {toggling ? "Updating…" : org.status === "suspended" ? "Reactivate" : "Suspend"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {org.status === "suspended" ? `Reactivate ${org.name}?` : `Suspend ${org.name}?`}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {org.status === "suspended"
                    ? "All members will regain access to the platform immediately."
                    : "All members will be blocked from accessing the platform immediately. You can reactivate at any time."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className={org.status === "suspended" ? "" : "bg-destructive text-destructive-foreground hover:bg-destructive/90"}
                  onClick={confirmToggleSuspend}
                >
                  {org.status === "suspended" ? "Yes, Reactivate" : "Yes, Suspend"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button className="rounded-full" asChild><Link href={`/super-admin/organizations/${org.id}/edit`}>Edit Organization</Link></Button>
          <AlertDialog onOpenChange={(open) => { if (!open) setDeleteInput(""); }}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="rounded-full bg-red-500/10 text-red-500 hover:bg-red-500/20 hover:text-red-500">
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {org.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently deletes the organization and all its campaigns, visits, outlets, and data. This cannot be undone.
                  <br /><br />
                  Type <strong>{org.name}</strong> to confirm.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Input
                ref={deleteInputRef}
                value={deleteInput}
                onChange={(e) => setDeleteInput(e.target.value)}
                placeholder={org.name}
                className="mt-1"
              />
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={deleteInput !== org.name || deleting}
                  onClick={confirmDelete}
                >
                  {deleting ? "Deleting…" : "Permanently Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total campaigns" value={String(org.campaignCount ?? 0)} />
        <Stat label="Total reps" value={String(org.userCount ?? 0)} />
        <Stat label="Total outlets" value={String(org.outletCount ?? 0)} />
        <Stat label="Total sales" value={String(org.salesCount ?? 0)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60 lg:col-span-8">
          <h2 className="font-semibold">Organization Details</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <Info label="Organization Name" value={org.name} />
            <Info label="Organization Code" value={org.slug} />
            <Info label="Industry" value={org.industry ?? "-"} />
            <Info label="Business Type" value={org.business_type ?? "-"} />
            <Info label="Website" value={org.website ?? "-"} />
            <Info label="Primary Contact Email" value={org.primary_contact_email ?? "-"} />
            <Info label="Primary Contact Phone" value={org.primary_contact_phone ?? "-"} />
            <Info label="Created At" value={new Date(org.created_at).toLocaleDateString()} />
          </div>
        </section>

        <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60 lg:col-span-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Team Members</h2>
            <ResendInviteButton organizationId={org.id} />
          </div>
          {members.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No members yet.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {members.map((m) => (
                <div key={m.id} className="flex items-center gap-3 rounded-2xl bg-muted/35 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{m.name}</p>
                    <p className="text-xs text-muted-foreground">{m.status}</p>
                  </div>
                  <Select
                    value={m.role}
                    disabled={roleChanging === m.id}
                    onValueChange={(role) => void changeRole(m.id, role)}
                  >
                    <SelectTrigger className="h-7 w-32 rounded-full text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="org_admin">Org Admin</SelectItem>
                      <SelectItem value="supervisor">Supervisor</SelectItem>
                      <SelectItem value="agent">Agent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60 lg:col-span-6">
          <h2 className="font-semibold">Operational Configuration</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Info label="Country" value={org.country ?? "Nigeria"} />
            <Info label="Timezone" value={org.timezone ?? "Africa/Lagos"} />
            <Info label="Currency" value={org.currency ?? "NGN"} />
            <Info label="Default Territory" value="-" />
          </div>
        </section>

        <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60 lg:col-span-6">
          <h2 className="font-semibold">Platform Configuration</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Info label="Status" value={orgStatus} />
            <Info label="Subscription Plan" value={orgPlan} />
            <Info label="Campaign Limit" value="Not Set" />
            <Info label="Storage Limit" value="Not Set" />
          </div>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60 lg:col-span-6">
          <h2 className="font-semibold">Branding</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-1">
            <Info label="Primary Color" value={org.brand_primary_color ?? "-"} />
            <Info label="Secondary Color" value={org.brand_secondary_color ?? "-"} />
            <Info label="Logo" value={org.logo_url ?? "Not uploaded"}  />
            <Info label="Report Header" value="Default" />
          </div>
          <div className="mt-4 space-y-3">
            <AssetPreview label="Logo" url={org.logo_url} />
            <div className="grid gap-3 sm:grid-cols-3">
              <AssetPreview label="favicon.ico" url={org.brand_favicon_ico_url} compact />
              <AssetPreview label="favicon-16x16" url={org.brand_favicon_16_url} compact />
              <AssetPreview label="favicon-32x32" url={org.brand_favicon_32_url} compact />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <AssetPreview label="apple-touch-icon" url={org.brand_apple_touch_icon_url} compact />
              <AssetPreview label="android-192" url={org.brand_android_192_url} compact />
              <AssetPreview label="android-512" url={org.brand_android_512_url} compact />
            </div>
            <div className="rounded-3xl bg-muted/35 p-4">
              <p className="text-xs text-muted-foreground">Manifest</p>
              {org.brand_manifest_url ? (
                <a className="mt-1 inline-block text-sm font-medium text-primary hover:underline" href={org.brand_manifest_url} target="_blank" rel="noreferrer">
                  Open uploaded manifest
                </a>
              ) : (
                <p className="mt-1 font-medium">Not uploaded</p>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60 lg:col-span-6">
          <h2 className="font-semibold">Billing & Usage</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Info label="Billing Email" value={org.billing_email ?? "-"} />
            <Info label="Storage Usage" value={org.storageUsage ?? "0 MB"} />
            <Info label="Monthly Activity" value={org.monthlyActivity ?? "Low"} />
            <Info label="Subscription Status" value={orgStatus === "Active" ? "In good standing" : orgStatus} />
          </div>
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl bg-muted/35 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}

function AssetPreview({ label, url, compact = false }: { label: string; url?: string | null; compact?: boolean }) {
  return (
    <div className="rounded-3xl bg-muted/35 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      {url ? (
        <div className="mt-2 space-y-2">
          <div className={`overflow-hidden rounded-xl border border-border/70 bg-background ${compact ? "h-16 w-16" : "h-24 w-full max-w-56"}`}>
            <img src={url} alt={`${label} preview`} className="h-full w-full object-contain p-1" />
          </div>
          <a className="inline-block text-xs text-primary hover:underline" href={url} target="_blank" rel="noreferrer">
            Open asset
          </a>
        </div>
      ) : (
        <p className="mt-1 font-medium">Not uploaded</p>
      )}
    </div>
  );
}
