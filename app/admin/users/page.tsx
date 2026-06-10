"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import ResendUserInviteButton from "@/components/admin/ResendUserInviteButton";
import UserStatusBadge from "@/components/admin/UserStatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable, type ColumnDef } from "@/components/shared/DataTable";
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
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");
  const pageSize = 20;

  const query = useQuery({
    queryKey: ["admin-users", page, search, role, status],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (search.trim()) params.set("search", search.trim());
      if (role !== "all") params.set("role", role);
      if (status !== "all") params.set("status", status);
      return authorizedFetch<{ success: boolean; users: AdminUser[]; total: number; roles: string[] }>(
        `/api/admin/users?${params.toString()}`
      );
    },
  });

  if (query.error) toast.error((query.error as Error).message);

  const columns: ColumnDef<AdminUser>[] = [
    {
      key: "name",
      header: "User",
      sortable: true,
      render: (row) => (
        <div>
          <Link href={`/admin/users/${row.id}`} className="font-medium text-foreground hover:underline">
            {row.displayName}
          </Link>
          <p className="mt-0.5 text-xs text-muted-foreground">{row.email ?? "-"}</p>
        </div>
      ),
    },
    {
      key: "organizationRole",
      header: "Org Role",
      render: (row) => <span className="text-muted-foreground">{row.organizationRole}</span>,
    },
    {
      key: "appRole",
      header: "App Role",
      render: (row) => <span className="text-muted-foreground">{row.appRole ?? "-"}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <UserStatusBadge status={row.status} />,
    },
    {
      key: "inviteSentAt",
      header: "Invite Sent",
      sortable: true,
      render: (row) => (
        <span className="text-xs text-muted-foreground">
          {row.inviteSentAt ? new Date(row.inviteSentAt).toLocaleString() : "-"}
        </span>
      ),
    },
    {
      key: "acceptedAt",
      header: "Accepted",
      sortable: true,
      render: (row) => (
        <span className="text-xs text-muted-foreground">
          {row.acceptedAt ? new Date(row.acceptedAt).toLocaleString() : "-"}
        </span>
      ),
    },
    {
      key: "action",
      header: "Action",
      align: "right",
      render: (row) =>
        row.status === "invited" || row.status === "inactive" ? (
          <ResendUserInviteButton userId={row.id} />
        ) : null,
    },
  ];

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
        {/* Filters */}
        <div className="mb-5 flex flex-wrap gap-2">
          <Input
            className="h-9 w-64 rounded-full"
            placeholder="Search name, email or role"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { setSearch(searchInput); setPage(1); }
            }}
          />
          <Select
            value={role}
            onValueChange={(v) => { setRole(v); setPage(1); }}
          >
            <SelectTrigger className="h-9 w-40 rounded-full">
              <SelectValue placeholder="Org role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {(query.data?.roles ?? []).map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={status}
            onValueChange={(v) => { setStatus(v); setPage(1); }}
          >
            <SelectTrigger className="h-9 w-36 rounded-full">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="invited">Invited</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            className="h-9 rounded-full px-4"
            onClick={() => { setSearch(searchInput); setPage(1); }}
          >
            Apply
          </Button>
        </div>

        <DataTable
          columns={columns}
          data={query.data?.users ?? []}
          rowKey={(row) => row.membershipId}
          loading={query.isLoading}
          emptyTitle="No users found"
          emptyDescription="Invite users to grant them access to this organization."
          pagination={{
            page,
            pageSize,
            total: query.data?.total ?? 0,
            hasMore: page * pageSize < (query.data?.total ?? 0),
            onPageChange: setPage,
          }}
        />
      </section>
    </div>
  );
}
