"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

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
import { DataTable, type ColumnDef, type RowAction } from "@/components/shared/DataTable";
import { authorizedFetch } from "@/lib/api/client";
import { useTerminology } from "@/components/providers/tenant-experience-provider";

type Rep = {
  id: string;
  repCode: string;
  displayName: string;
  phone: string | null;
  territory: string;
  status: string;
  targetOutlets: number | null;
  targetConversions: number | null;
  campaigns: Array<{ id: string; name: string }>;
  lastSignInAt: string | null;
  lastActivityAt: string | null;
};

export default function RepsPage() {
  const t = useTerminology();
  const router = useRouter();

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const pageSize = 20;

  const query = useQuery({
    queryKey: ["admin-reps", page, search, status, stateFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (search.trim()) params.set("search", search.trim());
      if (status !== "all") params.set("status", status);
      if (stateFilter !== "all") params.set("state", stateFilter);
      return authorizedFetch<{ success: boolean; reps: Rep[]; total: number; states: string[] }>(
        `/api/admin/reps?${params.toString()}`
      );
    },
  });

  if (query.error) toast.error((query.error as Error).message);

  const columns: ColumnDef<Rep>[] = [
    {
      key: "name",
      header: t("agent"),
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-medium text-foreground">{row.displayName}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {row.repCode} · {row.phone ?? "-"}
          </p>
        </div>
      ),
    },
    {
      key: "campaigns",
      header: t("campaigns"),
      render: (row) => (
        <span className="text-muted-foreground">
          {row.campaigns.length ? row.campaigns.map((c) => c.name).join(", ") : "-"}
        </span>
      ),
    },
    {
      key: "territory",
      header: "Territory",
      render: (row) => (
        <span className="text-muted-foreground">{row.territory || "-"}</span>
      ),
    },
    {
      key: "targets",
      header: "Targets",
      render: (row) => (
        <span className="text-muted-foreground">
          {row.targetOutlets ?? "-"} {t("outlets").toLowerCase()} /{" "}
          {row.targetConversions ?? "-"} conv
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <UserStatusBadge status={row.status} />,
    },
    {
      key: "lastSignIn",
      header: "Last Sign In",
      sortable: true,
      render: (row) => (
        <span className="text-muted-foreground">
          {row.lastSignInAt ? new Date(row.lastSignInAt).toLocaleDateString() : "-"}
        </span>
      ),
    },
    {
      key: "lastActivity",
      header: "Last Activity",
      sortable: true,
      render: (row) => (
        <span className="text-muted-foreground">
          {row.lastActivityAt ? new Date(row.lastActivityAt).toLocaleDateString() : "-"}
        </span>
      ),
    },
  ];

  const actions: RowAction<Rep>[] = [
    {
      label: "View profile",
      onClick: (row) => router.push(`/admin/reps/${row.id}`),
    },
  ];

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Sales {t("agents")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage {t("agents").toLowerCase()} and {t("campaign").toLowerCase()} assignments.
          </p>
        </div>
        <Button asChild className="rounded-full px-5">
          <Link href="/admin/reps/new">Add {t("agent")}</Link>
        </Button>
      </div>

      <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        {/* Filters */}
        <div className="mb-5 flex flex-wrap gap-2">
          <Input
            className="h-9 w-64 rounded-full"
            placeholder={`Search ${t("agent").toLowerCase()}, phone, code or territory`}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { setSearch(searchInput); setPage(1); }
            }}
          />
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
          <Select
            value={stateFilter}
            onValueChange={(v) => { setStateFilter(v); setPage(1); }}
          >
            <SelectTrigger className="h-9 w-40 rounded-full">
              <SelectValue placeholder="State" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All states</SelectItem>
              {(query.data?.states ?? []).map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
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
          data={query.data?.reps ?? []}
          rowKey={(row) => row.id}
          actions={actions}
          loading={query.isLoading}
          emptyTitle={`No sales ${t("agents").toLowerCase()} found`}
          emptyDescription={`Add ${t("agents").toLowerCase()} to assign them to ${t("campaigns").toLowerCase()} and territories.`}
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
