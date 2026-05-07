"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import UserStatusBadge from "@/components/admin/UserStatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { authorizedFetch } from "@/lib/api/client";

type UserDetails = {
  id: string;
  displayName: string;
  email: string | null;
  organizationRole: "org_admin" | "supervisor" | "agent";
  status: "active" | "inactive" | "invited" | "suspended";
};

export default function EditUserPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const userId = params.id;
  const [saving, setSaving] = useState(false);

  const query = useQuery({
    queryKey: ["admin-user-edit", userId],
    queryFn: async () => {
      const result = await authorizedFetch<{ success: boolean; user: UserDetails }>(`/api/admin/users/${userId}`);
      return result.user;
    },
  });

  const user = query.data;
  const [draft, setDraft] = useState<{
    role?: UserDetails["organizationRole"];
    status?: UserDetails["status"];
  }>({});

  if (query.error) toast.error((query.error as Error).message);

  async function save() {
    if (!user) return;
    const role = draft.role ?? user.organizationRole;
    const status = draft.status ?? user.status;
    setSaving(true);
    try {
      await authorizedFetch<{ success: boolean }>(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, status }),
      });
      toast.success("User updated.");
      router.push(`/admin/users/${user.id}`);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (query.isLoading) {
    return (
      <div className="rounded-4xl bg-card p-8 shadow-sm ring-1 ring-border/60">
        <div className="space-y-4">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-64" />
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        </div>
      </div>
    );
  }
  if (!user) return <div className="rounded-4xl bg-card p-10 text-center ring-1 ring-border/60">User not found.</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Edit User</h1>
          <p className="mt-1 text-sm text-muted-foreground">Update role and account status.</p>
        </div>
        <Button variant="outline" className="rounded-full" asChild><Link href={`/admin/users/${user.id}`}>Cancel</Link></Button>
      </div>
      <section className="rounded-4xl bg-card p-6 shadow-sm ring-1 ring-border/60 space-y-4">
        <div>
          <p className="font-medium">{user.displayName}</p>
          <p className="text-sm text-muted-foreground">{user.email ?? "-"}</p>
        </div>
        <div className="flex items-center gap-2"><span className="text-sm">Current:</span><UserStatusBadge status={user.status} /></div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm font-medium">Organization role</p>
            <Select
              value={draft.role ?? user.organizationRole}
              onValueChange={(value: UserDetails["organizationRole"]) => setDraft((prev) => ({ ...prev, role: value }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="org_admin">Organization Admin</SelectItem>
                <SelectItem value="supervisor">Supervisor</SelectItem>
                <SelectItem value="agent">Agent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Status</p>
            <Select
              value={draft.status ?? user.status}
              onValueChange={(value: UserDetails["status"]) => setDraft((prev) => ({ ...prev, status: value }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="invited">Invited</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-end">
          <Button className="rounded-full px-6" disabled={saving} onClick={save}>{saving ? "Saving..." : "Save Changes"}</Button>
        </div>
      </section>
    </div>
  );
}

