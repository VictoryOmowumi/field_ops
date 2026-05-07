import Link from "next/link";
import { Button } from "@/components/ui/button";

const users = [
  { id: "usr-001", name: "Platform Owner", role: "super_admin", scope: "All organizations", status: "Active" },
  { id: "usr-002", name: "Tolu Balogun", role: "org_admin", scope: "Acme Beverages", status: "Active" },
  { id: "usr-003", name: "Ada James", role: "supervisor", scope: "Golden Basket", status: "Active" },
];

export default function SuperAdminUsersPage() {
  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Users and Roles</h1>
        <p className="mt-1 text-sm text-muted-foreground">Role audit and access scope across all organizations.</p>
      </div>

      <section className="overflow-hidden rounded-3xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Role</th>
              <th className="px-4 py-3 text-left">Scope</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Action</th>
            </tr>
          </thead>
          <tbody>
            {users.map((item) => (
              <tr key={item.id} className="border-t border-border">
                <td className="px-4 py-4 font-medium">{item.name}</td>
                <td className="px-4 py-4">{item.role}</td>
                <td className="px-4 py-4">{item.scope}</td>
                <td className="px-4 py-4">{item.status}</td>
                <td className="px-4 py-4">
                  <Button variant="outline" className="rounded-full" asChild>
                    <Link href={`/super-admin/users/${item.id}`}>Manage</Link>
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
