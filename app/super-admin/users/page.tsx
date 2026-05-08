"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabaseClient } from "@/lib/supabase/client";
import type { PlatformUserRow } from "@/types/platform";

export default function SuperAdminUsersPage() {
  const [users, setUsers] = useState<PlatformUserRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUsers() {
      const { data } = await supabaseClient.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setLoading(false);
        toast.error("Session expired. Please sign in again.");
        return;
      }

      const response = await fetch("/api/platform/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = (await response.json()) as { success: boolean; message?: string; users?: PlatformUserRow[] };
      setLoading(false);
      if (!response.ok || !result.success) {
        toast.error(result.message ?? "Failed to load users.");
        return;
      }
      setUsers(result.users ?? []);
    }
    void loadUsers();
  }, []);

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
            {loading ? (
              <tr className="border-t border-border"><td className="px-4 py-4 text-muted-foreground" colSpan={5}>Loading users...</td></tr>
            ) : users.length === 0 ? (
              <tr className="border-t border-border"><td className="px-4 py-4 text-muted-foreground" colSpan={5}>No users found.</td></tr>
            ) : users.map((item, index) => (
              <tr key={`${item.id}-${index}`} className="border-t border-border">
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

