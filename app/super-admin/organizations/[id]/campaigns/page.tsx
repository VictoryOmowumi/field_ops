import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { organizations } from "@/data/organizations";
import { getOrganizationViewById } from "@/lib/data/organization-server";

export default async function OrganizationCampaignsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const org = (await getOrganizationViewById(id)) ?? organizations.find((item) => item.id === id);
  if (!org) return notFound();

  const campaigns = [
    { id: `${org.id}-camp-001`, name: `${org.name} Flagship Activation`, status: org.totalCampaigns > 0 ? "Active" : "Draft", reps: Math.max(0, Math.round(org.totalReps * 0.45)), conversions: Math.max(0, Math.round(org.totalSales * 0.4)) },
    { id: `${org.id}-camp-002`, name: `${org.name} Expansion Drive`, status: org.totalCampaigns > 1 ? "Active" : "Draft", reps: Math.max(0, Math.round(org.totalReps * 0.3)), conversions: Math.max(0, Math.round(org.totalSales * 0.25)) },
  ];

  return (
    <div className="space-y-6 pb-10">
      <div>
        <div className="mb-2 flex items-center gap-2">
          <Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/10">{org.status}</Badge>
          <span className="text-sm text-muted-foreground">{org.id}</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{org.name} Campaigns</h1>
      </div>
      <section className="rounded-3xl bg-card p-5 shadow-sm ring-1 ring-border/60 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground"><tr><th className="px-4 py-3 text-left">Campaign</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-left">Assigned Reps</th><th className="px-4 py-3 text-left">Conversions</th></tr></thead>
          <tbody>{campaigns.map((item) => (<tr key={item.id} className="border-t border-border"><td className="px-4 py-4 font-medium">{item.name}</td><td className="px-4 py-4">{item.status}</td><td className="px-4 py-4">{item.reps}</td><td className="px-4 py-4">{item.conversions}</td></tr>))}</tbody>
        </table>
      </section>
    </div>
  );
}
