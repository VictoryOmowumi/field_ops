"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DataTable, type ColumnDef } from "@/components/shared/DataTable";
import { authorizedFetch } from "@/lib/api/client";
import type { PlatformUserRow } from "@/types/platform";

export default function SuperAdminUsersPage() {
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const query = useQuery({
    queryKey: ["super-admin-users", page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      return authorizedFetch<{ success: boolean; users: PlatformUserRow[]; total: number }>(
        `/api/platform/users?${params.toString()}`
      );
    },
  });

  if (query.error) toast.error((query.error as Error).message);

  const columns: ColumnDef<PlatformUserRow>[] = [
    { key: "name", header: "Name", sortable: true, render: (row) => <span className="font-medium">{row.name}</span> },
    { key: "role", header: "Role", render: (row) => <span className="text-muted-foreground">{row.role}</span> },
    { key: "scope", header: "Scope", render: (row) => <span className="text-muted-foreground">{row.scope}</span> },
    { key: "status", header: "Status", render: (row) => <span className="text-muted-foreground">{row.status}</span> },
    {
      key: "action",
      header: "Action",
      align: "right",
      render: (row) => (
        <Button variant="outline" className="rounded-full" asChild>
          <Link href={`/super-admin/users/${row.id}`}>Manage</Link>
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Users and Roles</h1>
        <p className="mt-1 text-sm text-muted-foreground">Role audit and access scope across all organizations.</p>
      </div>

      <DataTable
        columns={columns}
        data={query.data?.users ?? []}
        rowKey={(row) => row.id}
        loading={query.isLoading}
        emptyTitle="No users found"
        emptyDescription="Users will appear here once organizations invite their teams."
        pagination={{
          page,
          pageSize,
          total: query.data?.total ?? 0,
          hasMore: page * pageSize < (query.data?.total ?? 0),
          onPageChange: setPage,
        }}
      />
    </div>
  );
}
