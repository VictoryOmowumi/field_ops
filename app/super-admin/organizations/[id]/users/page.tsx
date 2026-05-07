import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { organizations } from "@/data/organizations";
import { getOrganizationViewById } from "@/lib/data/organization-server";

export default async function OrganizationUsersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const org = (await getOrganizationViewById(id)) ?? organizations.find((item) => item.id === id);
  if (!org) return notFound();

  const users = [
    { name: org.primaryAdminName, role: "org_admin", status: "Active" },
    { name: "Operations Supervisor", role: "supervisor", status: org.status === "Archived" ? "Inactive" : "Active" },
    { name: "Field Agent Lead", role: "agent", status: org.status === "Suspended" ? "Suspended" : "Active" },
  ];

  return (
    <div className="space-y-6 pb-10">
      <div>
        <div className="mb-2 flex items-center gap-2"><Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/10">{org.status}</Badge><span className="text-sm text-muted-foreground">{org.id}</span></div>
        <h1 className="text-2xl font-semibold tracking-tight">{org.name} Users</h1>
      </div>
      <section className="rounded-3xl bg-card p-5 shadow-sm ring-1 ring-border/60 overflow-hidden">
        <table className="w-full text-sm"><thead className="bg-muted/50 text-muted-foreground"><tr><th className="px-4 py-3 text-left">Name</th><th className="px-4 py-3 text-left">Role</th><th className="px-4 py-3 text-left">Status</th></tr></thead><tbody>{users.map((item) => (<tr key={`${item.name}-${item.role}`} className="border-t border-border"><td className="px-4 py-4 font-medium">{item.name}</td><td className="px-4 py-4">{item.role}</td><td className="px-4 py-4">{item.status}</td></tr>))}</tbody></table>
      </section>
    </div>
  );
}
