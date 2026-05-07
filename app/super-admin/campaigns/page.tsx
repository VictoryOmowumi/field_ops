import Link from "next/link";
import { Button } from "@/components/ui/button";

const campaigns = [
  {
    id: "CAM001",
    organizationId: "org-001",
    organization: "Acme Beverages",
    campaign: "Lagos Retail Activation",
    status: "Active",
    sync: "98.8%",
    reps: 57,
    outlets: 386,
    conversions: 842,
  },
  {
    id: "CAM002",
    organizationId: "org-002",
    organization: "Golden Basket",
    campaign: "Abuja Market Storm",
    status: "Active",
    sync: "96.2%",
    reps: 34,
    outlets: 211,
    conversions: 503,
  },
  {
    id: "CAM003",
    organizationId: "org-003",
    organization: "Nova Distribution",
    campaign: "Kano Route Launch",
    status: "Draft",
    sync: "-",
    reps: 0,
    outlets: 0,
    conversions: 0,
  },
];

export default function SuperAdminCampaignsPage() {
  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Campaign Ops</h1>
          <p className="mt-1 text-sm text-muted-foreground">Cross-tenant campaign governance and rollout oversight.</p>
        </div>
      </div>

      <section className="overflow-hidden rounded-3xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-medium">ID</th>
              <th className="px-4 py-3 text-left">Organization</th>
              <th className="px-4 py-3 text-left">Campaign</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Sync Health</th>
              <th className="px-4 py-3 text-left">Action</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((item) => (
              <tr key={item.id} className="border-t border-border">
                <td className="px-4 py-4 text-muted-foreground">#{item.id}</td>
                <td className="px-4 py-4 font-medium">{item.organization}</td>
                <td className="px-4 py-4">{item.campaign}</td>
                <td className="px-4 py-4">{item.status}</td>
                <td className="px-4 py-4">{item.sync}</td>
                <td className="px-4 py-4">
                  <Button variant="outline" className="rounded-full" asChild>
                    <Link href={`/super-admin/campaigns/${item.id}`}>View</Link>
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
