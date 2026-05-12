"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

function titleCase(value: string | null | undefined) {
  if (!value) return "-";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function OrganizationDetailsPage() {
  const params = useParams<{ id: string }>();
  const orgId = params.id;
  const [org, setOrg] = useState<Org | null>(null);

  useEffect(() => {
    async function loadOrg() {
      const { data } = await supabaseClient.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const response = await fetch(`/api/platform/organizations/${orgId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = (await response.json()) as { success: boolean; message?: string; organization?: Org };
      if (!response.ok || !result.success || !result.organization) {
        toast.error(result.message ?? "Failed to load organization.");
        return;
      }
      setOrg(result.organization);
    }
    void loadOrg();
  }, [orgId]);

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
        <div className="flex gap-2">
          <Button variant="outline" className="rounded-full" asChild><Link href="/super-admin/organizations">Back</Link></Button>
          <Button className="rounded-full" asChild><Link href={`/super-admin/organizations/${org.id}/edit`}>Edit Organization</Link></Button>
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
            <h2 className="font-semibold">Primary Admin</h2>
            <ResendInviteButton organizationId={org.id} />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Info label="Full Name" value={org.primaryAdminName ?? "Organization Admin"} />
            <Info label="Email" value={org.primaryAdminEmail ?? "-"} />
            <Info label="Phone" value={org.primaryAdminPhone ?? "-"} />
            <Info label="Role" value="organization_admin" />
          </div>
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
