import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { organizations } from "@/data/organizations";
import { getOrganizationViewById } from "@/lib/data/organization-server";

export default async function OrganizationUsagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const org = (await getOrganizationViewById(id)) ?? organizations.find((item) => item.id === id);
  if (!org) return notFound();

  const usage = [
    { metric: "Total campaigns", value: org.totalCampaigns.toString() },
    { metric: "Total reps", value: org.totalReps.toString() },
    { metric: "Total outlets", value: org.totalOutlets.toString() },
    { metric: "Total sales", value: org.totalSales.toString() },
    { metric: "Storage usage", value: org.storageUsage },
    { metric: "Monthly activity", value: org.monthlyActivity },
  ];

  return (
    <div className="space-y-6 pb-10">
      <div>
        <div className="mb-2 flex items-center gap-2"><Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/10">{org.status}</Badge><span className="text-sm text-muted-foreground">{org.id}</span></div>
        <h1 className="text-2xl font-semibold tracking-tight">{org.name} Usage</h1>
      </div>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {usage.map((item) => (<article key={item.metric} className="rounded-3xl bg-card p-5 shadow-sm ring-1 ring-border/60"><p className="text-xs text-muted-foreground">{item.metric}</p><p className="mt-2 text-2xl font-semibold">{item.value}</p></article>))}
      </section>
    </div>
  );
}
