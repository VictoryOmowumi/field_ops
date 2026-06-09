"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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

type OutletRow = {
  id: string;
  name: string;
  type: string;
  phone: string;
  address: string;
  status: "Converted" | "Onboarded";
  campaign: string;
  rep: string;
  location: string;
  syncStatus: "pending" | "synced" | "failed";
  createdAt: string;
};

function SyncBadge({ status }: { status: "pending" | "synced" | "failed" }) {
  const cls =
    status === "synced"
      ? "bg-primary/10 text-primary"
      : status === "failed"
      ? "bg-destructive/10 text-destructive"
      : "bg-muted text-muted-foreground";
  return (
    <Badge className={`rounded-full capitalize hover:bg-inherit ${cls}`}>{status}</Badge>
  );
}

export default function OutletsPage() {
  const t = useTerminology();
  const router = useRouter();

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [syncStatus, setSyncStatus] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const pageSize = 20;

  const query = useQuery({
    queryKey: ["admin-outlets", page, search, syncStatus, stateFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (search.trim()) params.set("search", search.trim());
      if (syncStatus !== "all") params.set("syncStatus", syncStatus);
      if (stateFilter !== "all") params.set("state", stateFilter);
      return authorizedFetch<{
        success: boolean;
        outlets: OutletRow[];
        total: number;
        states: string[];
      }>(`/api/admin/outlets?${params.toString()}`);
    },
  });

  if (query.error) toast.error((query.error as Error).message);

  const columns: ColumnDef<OutletRow>[] = [
    {
      key: "name",
      header: t("outlet"),
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-medium text-foreground">{row.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {row.type} · {row.phone || "N/A"}
          </p>
          {row.address && (
            <p className="text-xs text-muted-foreground">{row.address}</p>
          )}
        </div>
      ),
    },
    {
      key: "campaign",
      header: t("campaign"),
      render: (row) => <span className="text-muted-foreground">{row.campaign}</span>,
    },
    {
      key: "rep",
      header: t("agent"),
      render: (row) => <span className="text-muted-foreground">{row.rep}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge
          className={`rounded-full hover:bg-inherit ${
            row.status === "Converted"
              ? "bg-emerald-500/10 text-emerald-600"
              : "bg-amber-500/10 text-amber-600"
          }`}
        >
          {row.status}
        </Badge>
      ),
    },
    {
      key: "location",
      header: "Location",
      render: (row) => <span className="text-muted-foreground">{row.location}</span>,
    },
    {
      key: "createdAt",
      header: "Created",
      sortable: true,
      render: (row) => (
        <span className="text-muted-foreground">
          {new Date(row.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: "sync",
      header: "Sync",
      render: (row) => <SyncBadge status={row.syncStatus} />,
    },
  ];

  const actions: RowAction<OutletRow>[] = [
    {
      label: "View details",
      onClick: (row) => router.push(`/admin/outlets/${row.id}`),
    },
  ];

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t("outlets")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review registered {t("outlets").toLowerCase()} and field coverage.
          </p>
        </div>
      </div>

      <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        {/* Filters */}
        <div className="mb-5 flex flex-wrap gap-2">
          <Input
            className="h-9 w-64 rounded-full"
            placeholder={`Search ${t("outlet").toLowerCase()}, phone, state or LGA`}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { setSearch(searchInput); setPage(1); }
            }}
          />
          <Select
            value={syncStatus}
            onValueChange={(v) => { setSyncStatus(v); setPage(1); }}
          >
            <SelectTrigger className="h-9 w-36 rounded-full">
              <SelectValue placeholder="Sync status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sync</SelectItem>
              <SelectItem value="synced">Synced</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
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
          data={query.data?.outlets ?? []}
          rowKey={(row) => row.id}
          actions={actions}
          loading={query.isLoading}
          emptyTitle={`No ${t("outlets").toLowerCase()} yet`}
          emptyDescription={`${t("outlets")} appear here when ${t("agents").toLowerCase()} start capturing in the field.`}
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
