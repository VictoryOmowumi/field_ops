"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { supabaseClient } from "@/lib/supabase/client";

type Org = { id: string; name: string; status: string };
type Row = { id: string; name: string; role: string; status: string };

export default function OrganizationUsersPage() {
  const params = useParams<{ id: string }>();
  const orgId = params.id;
  const [org, setOrg] = useState<Org | null>(null);
  const [users, setUsers] = useState<Row[]>([]);

  useEffect(() => {
    async function load() {
      const { data } = await supabaseClient.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;

      const [orgRes, usersRes] = await Promise.all([
        fetch(`/api/platform/organizations/${orgId}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/platform/organizations/${orgId}/users`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      const orgJson = (await orgRes.json()) as { success: boolean; organization?: { id: string; name: string; status: string } };
      const usersJson = (await usersRes.json()) as { success: boolean; users?: Row[]; message?: string };

      if (orgRes.ok && orgJson.success && orgJson.organization) {
        setOrg({ id: orgJson.organization.id, name: orgJson.organization.name, status: orgJson.organization.status });
      }
      if (usersRes.ok && usersJson.success) {
        setUsers(usersJson.users ?? []);
      } else {
        toast.error(usersJson.message ?? "Failed to load organization users.");
      }
    }
    void load();
  }, [orgId]);

  if (!org) return <div className="rounded-3xl border border-border p-4 text-sm text-muted-foreground">Loading organization users...</div>;

  return (
    <div className="space-y-6 pb-10">
      <div>
        <div className="mb-2 flex items-center gap-2"><Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/10">{org.status}</Badge><span className="text-sm text-muted-foreground">{org.id}</span></div>
        <h1 className="text-2xl font-semibold tracking-tight">{org.name} Users</h1>
      </div>
      <section className="overflow-hidden rounded-3xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <table className="w-full text-sm"><thead className="bg-muted/50 text-muted-foreground"><tr><th className="px-4 py-3 text-left">Name</th><th className="px-4 py-3 text-left">Role</th><th className="px-4 py-3 text-left">Status</th></tr></thead><tbody>{users.map((item) => (<tr key={item.id} className="border-t border-border"><td className="px-4 py-4 font-medium">{item.name}</td><td className="px-4 py-4">{item.role}</td><td className="px-4 py-4">{item.status}</td></tr>))}{users.length === 0 ? <tr className="border-t border-border"><td className="px-4 py-4 text-muted-foreground" colSpan={3}>No users found.</td></tr> : null}</tbody></table>
      </section>
    </div>
  );
}

