"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import ResendUserInviteButton from "@/components/admin/ResendUserInviteButton";
import UserStatusBadge from "@/components/admin/UserStatusBadge";
import { Button } from "@/components/ui/button";
import { authorizedFetch } from "@/lib/api/client";

type AdminUser = {
  id: string;
  membershipId: string;
  displayName: string;
  email: string | null;
  organizationRole: string;
  appRole: string | null;
  status: string;
  inviteSentAt: string | null;
  acceptedAt: string | null;
};

export default function AdminUsersPage() {
  const query = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const result = await authorizedFetch<{ success: boolean; users: AdminUser[] }>("/api/admin/users");
      return result.users ?? [];
    },
  });

  if (query.error) toast.error((query.error as Error).message);

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Users</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage org admins, supervisors, and agents.</p>
        </div>
        <Button className="rounded-full" asChild><Link href="/admin/users/new">Invite User</Link></Button>
      </div>
       <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <div className="overflow-hidden rounded-3xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
            <tr><th className="px-4 py-3 text-left">User</th><th className="px-4 py-3 text-left">Org Role</th><th className="px-4 py-3 text-left">App Role</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-left">Invite Sent</th><th className="px-4 py-3 text-left">Accepted</th><th className="px-4 py-3 text-right">Action</th></tr>
          </thead>
          <tbody>
            {query.isLoading ? (
              <tr className="border-t border-border"><td className="px-4 py-6 text-muted-foreground" colSpan={7}>Loading users...</td></tr>
            ) : (query.data ?? []).length === 0 ? (
              <tr className="border-t border-border"><td className="px-4 py-6 text-muted-foreground" colSpan={7}>No users found for this organization.</td></tr>
            ) : (
              (query.data ?? []).map((user) => (
                <tr key={user.membershipId} className="border-t border-border">
                  <td className="px-4 py-4">
                    <Link href={`/admin/users/${user.id}`} className="font-medium hover:underline">{user.displayName}</Link>
                    <p className="text-xs text-muted-foreground">{user.email ?? "-"}</p>
                  </td>
                  <td className="px-4 py-4 text-muted-foreground">{user.organizationRole}</td>
                  <td className="px-4 py-4 text-muted-foreground">{user.appRole ?? "-"}</td>
                  <td className="px-4 py-4"><UserStatusBadge status={user.status} /></td>
                  <td className="px-4 py-4 text-xs text-muted-foreground">{user.inviteSentAt ? new Date(user.inviteSentAt).toLocaleString() : "-"}</td>
                  <td className="px-4 py-4 text-xs text-muted-foreground">{user.acceptedAt ? new Date(user.acceptedAt).toLocaleString() : "-"}</td>
                  <td className="px-4 py-4 text-right">
                    {(user.status === "invited" || user.status === "inactive") ? <ResendUserInviteButton userId={user.id} /> : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      </section>
    </div>
  );
}

