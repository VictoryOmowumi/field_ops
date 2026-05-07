import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { organizations } from "@/data/organizations";
import { getOrganizationViewById } from "@/lib/data/organization-server";
import ResendInviteButton from "@/components/super-admin/ResendInviteButton";

export default async function OrganizationDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const org = (await getOrganizationViewById(id)) ?? organizations.find((item) => item.id === id);
  if (!org) return notFound();

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/10">{org.status}</Badge>
            <span className="text-sm text-muted-foreground">{org.id}</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">{org.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{org.slug} · {org.industry} · {org.businessType}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="rounded-full" asChild><Link href="/super-admin/organizations">Back</Link></Button>
          <Button className="rounded-full" asChild><Link href={`/super-admin/organizations/${org.id}/edit`}>Edit Organization</Link></Button>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total campaigns" value={org.totalCampaigns.toString()} />
        <Stat label="Total reps" value={org.totalReps.toString()} />
        <Stat label="Total outlets" value={org.totalOutlets.toString()} />
        <Stat label="Total sales" value={org.totalSales.toString()} />
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60 lg:col-span-8">
          <h2 className="font-semibold">Organization Details</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <Info label="Organization Name" value={org.name} />
            <Info label="Organization Code" value={org.slug} />
            <Info label="Industry" value={org.industry} />
            <Info label="Business Type" value={org.businessType} />
            <Info label="Website" value={org.website ?? "-"} />
            <Info label="Primary Contact Email" value={org.primaryContactEmail} />
            <Info label="Primary Contact Phone" value={org.primaryContactPhone} />
            <Info label="Created At" value={org.createdAt} />
          </div>
        </section>

        <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60 lg:col-span-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Primary Admin</h2>
            <ResendInviteButton organizationId={org.id} />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Info label="Full Name" value={org.primaryAdminName} />
            <Info label="Email" value={org.primaryAdminEmail} />
            <Info label="Phone" value={org.primaryAdminPhone} />
            <Info label="Role" value="organization_admin" />
          </div>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60 lg:col-span-6">
          <h2 className="font-semibold">Operational Configuration</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Info label="Country" value={org.country} />
            <Info label="Timezone" value={org.timezone} />
            <Info label="Currency" value={org.currency} />
            <Info label="Default Territory" value="-" />
          </div>
        </section>

        <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60 lg:col-span-6">
          <h2 className="font-semibold">Platform Configuration</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Info label="Status" value={org.status} />
            <Info label="Subscription Plan" value={org.plan} />
            <Info label="Campaign Limit" value="Not Set" />
            <Info label="Storage Limit" value="Not Set" />
          </div>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60 lg:col-span-6">
          <h2 className="font-semibold">Branding</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Info label="Primary Color" value={org.brandPrimaryColor ?? "-"} />
            <Info label="Secondary Color" value={org.brandSecondaryColor ?? "-"} />
            <Info label="Logo" value={org.logoUrl ?? "Not uploaded"} />
            <Info label="Report Header" value="Default" />
          </div>
        </section>

        <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60 lg:col-span-6">
          <h2 className="font-semibold">Billing & Usage</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Info label="Billing Email" value={org.billingEmail ?? "-"} />
            <Info label="Storage Usage" value={org.storageUsage} />
            <Info label="Monthly Activity" value={org.monthlyActivity} />
            <Info label="Subscription Status" value={org.status === "Active" ? "In good standing" : org.status} />
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
