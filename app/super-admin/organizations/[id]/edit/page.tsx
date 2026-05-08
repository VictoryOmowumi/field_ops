import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getOrganizationViewById } from "@/lib/data/organization-server";

export default async function EditOrganizationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const org = await getOrganizationViewById(id);
  if (!org) return notFound();

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Edit Organization</h1>
          <p className="mt-1 text-sm text-muted-foreground">Update identity, admin ownership, and platform defaults.</p>
        </div>
        <Button variant="outline" className="rounded-full" asChild><Link href={`/super-admin/organizations/${org.id}`}>Cancel</Link></Button>
      </div>

      <section className="rounded-4xl bg-card p-6 shadow-sm ring-1 ring-border/60 grid gap-4 md:grid-cols-2">
        <Input defaultValue={org.name} />
        <Input defaultValue={org.slug} />
        <Input defaultValue={org.industry} />
        <Input defaultValue={org.website ?? ""} placeholder="Website" />
      </section>

      <section className="rounded-4xl bg-card p-6 shadow-sm ring-1 ring-border/60 grid gap-4 md:grid-cols-2">
        <Input defaultValue={org.primaryAdminName} />
        <Input defaultValue={org.primaryAdminEmail} />
        <Input defaultValue={org.primaryAdminPhone} />
        <Input defaultValue={org.primaryContactPhone} />
      </section>

      <section className="rounded-4xl bg-card p-6 shadow-sm ring-1 ring-border/60 grid gap-4 md:grid-cols-2">
        <Input defaultValue={org.country} />
        <Input defaultValue={org.timezone} />
        <Input defaultValue={org.currency} />
        <Select defaultValue={org.status.toLowerCase()}>
          <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="trial">Trial</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </section>
    </div>
  );
}
