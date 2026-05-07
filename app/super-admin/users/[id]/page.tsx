import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const users = [
  { id: "usr-001", name: "Platform Owner", role: "super_admin", scope: "All organizations", status: "Active", email: "owner@activationiq.com", phone: "+2348030009000" },
  { id: "usr-002", name: "Tolu Balogun", role: "org_admin", scope: "Acme Beverages", status: "Active", email: "tolu@acmebev.com", phone: "+2348030001222" },
  { id: "usr-003", name: "Ada James", role: "supervisor", scope: "Golden Basket", status: "Active", email: "ada@goldenbasket.ng", phone: "+2348030002888" },
];

export default async function SuperAdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = users.find((item) => item.id === id);
  if (!user) return notFound();

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/10">{user.status}</Badge>
            <span className="text-sm text-muted-foreground">{user.id}</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">{user.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{user.role} · {user.scope}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="rounded-full" asChild><Link href="/super-admin/users">Back</Link></Button>
          <Button className="rounded-full">Update Access</Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60 lg:col-span-9">
          <h2 className="font-semibold">User Details</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-5">
            <Info label="Full Name" value={user.name} />
            <Info label="Email" value={user.email} />
            <Info label="Phone" value={user.phone} />
            <Info label="Role" value={user.role} />
            <Info label="Scope" value={user.scope} />
            <Info label="Status" value={user.status} />
          </div>
        </section>

        <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60 lg:col-span-3">
          <h2 className="font-semibold">Access Controls</h2>
          <div className="mt-4 space-y-3">
            <Control label="Can manage organizations" value={user.role === "super_admin" ? "Yes" : "No"} />
            <Control label="Can view all campaigns" value={user.role === "super_admin" ? "Yes" : "No"} />
            <Control label="Can export cross-tenant reports" value={user.role === "super_admin" ? "Yes" : "No"} />
            <Control label="Login status" value={user.status} />
          </div>
        </section>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className=" p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}

function Control({ label, value }: { label: string; value: string }) {
  return (
    <div className=" p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}
