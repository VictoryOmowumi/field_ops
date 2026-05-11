"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import ResendUserInviteButton from "@/components/admin/ResendUserInviteButton";
import UserStatusBadge from "@/components/admin/UserStatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { authorizedFetch } from "@/lib/api/client";

type UserDetails = {
  id: string;
  membershipId: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  organizationRole: "org_admin" | "supervisor" | "agent";
  appRole: string | null;
  status: "active" | "inactive" | "invited" | "suspended";
  inviteSentAt: string | null;
  acceptedAt: string | null;
  lastSignInAt: string | null;
  createdAt: string | null;
};

export default function UserDetailsPage() {
  const params = useParams<{ id: string }>();
  const userId = params.id;

  const query = useQuery({
    queryKey: ["admin-user", userId],
    queryFn: async () => {
      const result = await authorizedFetch<{ success: boolean; user: UserDetails }>(`/api/admin/users/${userId}`);
      return result.user;
    },
  });
  const [updatingStatus, setUpdatingStatus] = useState<"active" | "inactive" | null>(null);

  async function quickStatusUpdate(status: "active" | "inactive") {
    setUpdatingStatus(status);
    try {
      await authorizedFetch<{ success: boolean }>(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      toast.success(`User marked as ${status}.`);
      await query.refetch();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setUpdatingStatus(null);
    }
  }

  if (query.error) toast.error((query.error as Error).message);
  if (query.isLoading) {
    return (
      <div className="rounded-4xl bg-card p-8 shadow-sm ring-1 ring-border/60">
        <div className="space-y-4">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-4 w-72" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        </div>
      </div>
    );
  }
  if (!query.data) return <div className="rounded-4xl bg-card p-10 text-center ring-1 ring-border/60">User not found.</div>;

  const user = query.data;

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <UserStatusBadge status={user.status} />
            <span className="text-xs text-muted-foreground">{user.organizationRole}</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">{user.displayName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{user.email ?? "-"} · {user.phone ?? "-"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="rounded-full" asChild><Link href="/admin/users">Back</Link></Button>
          <Button className="rounded-full" asChild><Link href={`/admin/users/${user.id}/edit`}>Edit User</Link></Button>
        </div>
      </div>

      <section className="rounded-4xl bg-card p-6 shadow-sm ring-1 ring-border/60">
        <h2 className="font-medium">Lifecycle</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Info label="Invite sent" value={formatDate(user.inviteSentAt)} />
          <Info label="Accepted at" value={formatDate(user.acceptedAt)} />
          <Info label="Last sign in" value={formatDate(user.lastSignInAt)} />
          <Info label="Created" value={formatDate(user.createdAt)} />
        </div>
      </section>

      <section className="flex justify-end">
        <div className="mt-2 flex flex-wrap gap-2">
          {user.status === "active" ? (
            <Button
              variant="destructive"
              className="rounded-full"
              onClick={() => quickStatusUpdate("inactive")}
              disabled={updatingStatus !== null}
            >
              {updatingStatus === "inactive" ? "Deactivating..." : "Deactivate"}
            </Button>
          ) : (
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => quickStatusUpdate("active")}
              disabled={updatingStatus !== null}
            >
              {updatingStatus === "active" ? "Activating..." : "Activate"}
            </Button>
          )}
          {(user.status === "invited" || user.status === "inactive") ? <ResendUserInviteButton userId={user.id} /> : null}
        
        </div>
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-background p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-medium">{value}</p></div>;
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
}

