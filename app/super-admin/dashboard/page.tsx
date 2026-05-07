import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { organizations } from "@/data/organizations";

const incidents = [
  { organization: "Golden Basket", issue: "Upload success dropped below 95%", severity: "Medium", time: "18 mins ago" },
  { organization: "Acme Beverages", issue: "Pending queue spike in Ikeja", severity: "Low", time: "32 mins ago" },
  { organization: "Prime Consumer Goods", issue: "Admin invite not accepted", severity: "Low", time: "1 hr ago" },
];

export default function SuperAdminDashboardPage() {
  const totalCampaigns = organizations.reduce((sum, org) => sum + org.totalCampaigns, 0);
  const totalReps = organizations.reduce((sum, org) => sum + org.totalReps, 0);

  return (
    <div className="flex flex-col gap-6 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Platform Overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">Monitor tenant onboarding, campaign activity, and platform health.</p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" className="h-11 rounded-full px-5" asChild>
            <Link href="/super-admin/organizations">View Organizations</Link>
          </Button>
          <Button className="h-11 rounded-full px-5" asChild>
            <Link href="/super-admin/organizations/new">Create Organization</Link>
          </Button>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60 lg:col-span-7">
          <h2 className="font-medium">Tenant Health Summary</h2>
          <p className="text-sm font-light text-muted-foreground">Rollup of active organizations and campaign load.</p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Metric label="Organizations" value={organizations.length.toString()} note="All tenants" />
            <Metric label="Active organizations" value={organizations.filter((o) => o.status === "Active").length.toString()} note="Currently operating" />
            <Metric label="Total campaigns" value={totalCampaigns.toString()} note="Across tenants" />
            <Metric label="Total reps" value={totalReps.toString()} note="Assigned field agents" />
          </div>
        </div>

        <div className="rounded-4xl bg-foreground p-5 text-background shadow-sm lg:col-span-5">
          <h2 className="font-medium">Platform Health</h2>
          <p className="text-sm opacity-70">Operational reliability across sync and onboarding.</p>
          <div className="mt-6 space-y-3">
            <Health label="Sync success rate" value="97.9%" />
            <Health label="Freshness under 5 min" value="96.4%" />
            <Health label="Invite completion" value="91.0%" />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60 lg:col-span-7">
          <h2 className="font-semibold">Organization Snapshot</h2>
          <p className="text-sm text-muted-foreground">Quick access to major tenant accounts.</p>
          <div className="mt-5 overflow-hidden rounded-3xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Organization</th>
                  <th className="px-4 py-3 text-left font-medium">Org ID</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Campaigns</th>
                </tr>
              </thead>
              <tbody>
                {organizations.map((org) => (
                  <tr key={org.id} className="border-t border-border">
                    <td className="px-4 py-4 font-medium"><Link href={`/super-admin/organizations/${org.id}`} className="hover:underline">{org.name}</Link></td>
                    <td className="px-4 py-4 text-muted-foreground">{org.id}</td>
                    <td className="px-4 py-4"><Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/10">{org.status}</Badge></td>
                    <td className="px-4 py-4">{org.totalCampaigns}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60 lg:col-span-5">
          <h2 className="font-semibold">Incidents & Attention</h2>
          <p className="text-sm text-muted-foreground">Recent cross-tenant issues requiring follow-up.</p>
          <div className="mt-4 space-y-3">
            {incidents.map((item) => (
              <div key={`${item.organization}-${item.time}`} className="rounded-3xl bg-muted/35 p-4">
                <p className="font-medium">{item.organization}</p>
                <p className="mt-1 text-sm text-muted-foreground">{item.issue}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.severity} · {item.time}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-[1.6rem] bg-background p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

function Health({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="flex justify-between text-sm"><span className="opacity-80">{label}</span><span>{value}</span></div>
      <div className="mt-2 h-2 rounded-full bg-background/20">
        <div className="h-full rounded-full bg-primary" style={{ width: value }} />
      </div>
    </div>
  );
}
