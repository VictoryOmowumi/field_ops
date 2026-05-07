import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const campaigns = [
  {
    id: "CAM001",
    organizationId: "org-001",
    organization: "Acme Beverages",
    name: "Lagos Retail Activation",
    status: "Active",
    sync: "98.8%",
    description: "Field sales activation focused on outlet conversion and retail visibility across Lagos.",
    startDate: "Apr 21, 2026",
    endDate: "May 12, 2026",
    reps: 57,
    outlets: 386,
    conversions: 842,
    pendingUploads: 23,
  },
  {
    id: "CAM002",
    organizationId: "org-002",
    organization: "Golden Basket",
    name: "Abuja Market Storm",
    status: "Active",
    sync: "96.2%",
    description: "Market-wide retail push for outlet activation and SKU conversion in Abuja.",
    startDate: "Apr 15, 2026",
    endDate: "May 10, 2026",
    reps: 34,
    outlets: 211,
    conversions: 503,
    pendingUploads: 17,
  },
  {
    id: "CAM003",
    organizationId: "org-003",
    organization: "Nova Distribution",
    name: "Kano Route Launch",
    status: "Draft",
    sync: "-",
    description: "Pre-launch setup for territory rollout and field onboarding.",
    startDate: "May 10, 2026",
    endDate: "May 30, 2026",
    reps: 0,
    outlets: 0,
    conversions: 0,
    pendingUploads: 0,
  },
];

const recentActivity = [
  { rep: "Ada James", outlet: "Jolly Mart", status: "Converted", time: "12 mins ago" },
  { rep: "Tunde Bello", outlet: "Prime Stores", status: "Pending", time: "21 mins ago" },
  { rep: "Mary Okon", outlet: "City Retail", status: "Revisit", time: "34 mins ago" },
];

export default async function SuperAdminCampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = campaigns.find((item) => item.id === id);
  if (!campaign) return notFound();

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/10">{campaign.status}</Badge>
            <span className="text-sm text-muted-foreground">{campaign.startDate} - {campaign.endDate}</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">{campaign.name}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{campaign.description}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Organization: <Link className="text-primary hover:underline" href={`/super-admin/organizations/${campaign.organizationId}`}>{campaign.organization}</Link>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="rounded-full" asChild><Link href="/super-admin/campaigns">Back</Link></Button>
          <Button className="rounded-full px-5" asChild><Link href={`/super-admin/organizations/${campaign.organizationId}/campaigns`}>Manage In Tenant</Link></Button>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Assigned reps" value={campaign.reps} />
        <Stat label="Outlets covered" value={campaign.outlets} />
        <Stat label="Conversions" value={campaign.conversions} />
        <Stat label="Pending uploads" value={campaign.pendingUploads} />
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60 lg:col-span-7">
          <h2 className="font-semibold">Campaign Overview</h2>
          <p className="mt-1 text-sm text-muted-foreground">Cross-tenant execution summary for this campaign.</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Info label="Campaign ID" value={campaign.id} />
            <Info label="Organization ID" value={campaign.organizationId} />
            <Info label="Organization" value={campaign.organization} />
            <Info label="Sync Health" value={campaign.sync} />
          </div>
        </section>

        <section className="rounded-4xl bg-foreground p-5 text-background shadow-sm lg:col-span-5">
          <h2 className="font-semibold">Governance Health</h2>
          <p className="mt-1 text-sm opacity-70">Super admin monitoring indicators.</p>
          <div className="mt-6 space-y-4">
            <Health label="Photo compliance" value="92%" />
            <Health label="GPS capture rate" value="96%" />
            <Health label="Upload success rate" value={campaign.sync} />
          </div>
        </section>
      </div>

      <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <h2 className="font-semibold">Recent Activity</h2>
        <p className="mt-1 text-sm text-muted-foreground">Latest submissions from the assigned organization team.</p>
        <div className="mt-5 overflow-hidden rounded-3xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Rep</th>
                <th className="px-4 py-3 text-left font-medium">Outlet</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {recentActivity.map((item) => (
                <tr key={`${item.rep}-${item.time}`} className="border-t border-border">
                  <td className="px-4 py-4 font-medium">{item.rep}</td>
                  <td className="px-4 py-4 text-muted-foreground">{item.outlet}</td>
                  <td className="px-4 py-4">{item.status}</td>
                  <td className="px-4 py-4 text-muted-foreground">{item.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[1.6rem] bg-card p-5 shadow-sm ring-1 ring-border/60">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value.toLocaleString()}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl bg-background p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}

function Health({ label, value }: { label: string; value: string }) {
  const width = value.endsWith("%") ? value : "0%";
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="opacity-70">{label}</span>
        <span>{value}</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-background/10">
        <div className="h-full rounded-full bg-primary" style={{ width }} />
      </div>
    </div>
  );
}
