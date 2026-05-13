"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { authorizedFetch } from "@/lib/api/client";
import TableEmptyStateRow from "@/components/shared/TableEmptyStateRow";
import TableLoadingState from "@/components/shared/TableLoadingState";

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

export default function OutletsPage() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [syncStatus, setSyncStatus] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const pageSize = 20;

  const query = useQuery({
    queryKey: ["admin-outlets", page, search, syncStatus, stateFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search.trim()) params.set("search", search.trim());
      if (syncStatus !== "all") params.set("syncStatus", syncStatus);
      if (stateFilter !== "all") params.set("state", stateFilter);
      return await authorizedFetch<{ success: boolean; outlets: OutletRow[]; total: number; states: string[] }>(`/api/admin/outlets?${params.toString()}`);
    },
  });

  if (query.error) toast.error((query.error as Error).message);

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Outlets</h1>
          <p className="mt-1 text-sm text-muted-foreground">Review registered outlets and field coverage.</p>
        </div>
      </div>

      <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <div className="mb-4 flex flex-wrap gap-2">
          <Input
            className="h-11 w-72 rounded-full"
            placeholder="Search outlet, phone, state or LGA"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          <Select value={syncStatus} onValueChange={(value) => { setSyncStatus(value); setPage(1); }}>
            <SelectTrigger className="h-11 w-40 rounded-full">
              <SelectValue placeholder="Sync status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sync</SelectItem>
              <SelectItem value="synced">Synced</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={stateFilter} onValueChange={(value) => { setStateFilter(value); setPage(1); }}>
            <SelectTrigger className="h-11 w-44 rounded-full">
              <SelectValue placeholder="State" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All states</SelectItem>
              {(query.data?.states ?? []).map((state) => (
                <SelectItem key={state} value={state}>{state}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            className="h-11 rounded-full px-5"
            onClick={() => {
              setSearch(searchInput);
              setPage(1);
            }}
          >
            Apply Filters
          </Button>
        </div>

        <div className="overflow-hidden rounded-3xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Outlet</th>
                <th className="px-4 py-3 text-left font-medium">Campaign</th>
                <th className="px-4 py-3 text-left font-medium">Rep</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Created</th>
                <th className="px-4 py-3 text-left font-medium">Location</th>
                <th className="px-4 py-3 text-left font-medium">Sync</th>
                <th className="px-4 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>

            <tbody>
              {query.isLoading ? (
                <TableLoadingState colSpan={8} title="Loading outlets..." description="Fetching outlet records and sync status." />
              ) : (query.data?.outlets ?? []).length === 0 ? (
                <TableEmptyStateRow colSpan={8} title="No outlets yet" description="Outlets will appear here when reps start capturing in the field." />
              ) : (
                (query.data?.outlets ?? []).map((outlet) => (
                  <tr key={outlet.id} className="border-t border-border">
                    <td className="px-4 py-4">
                      <p className="font-medium">{outlet.name}</p>
                      <p className="text-xs text-muted-foreground">{outlet.type} · {outlet.phone || "N/A"}</p>
                      <p className="text-xs text-muted-foreground">{outlet.address || "N/A"}</p>
                    </td>
                    <td className="px-4 py-4 text-muted-foreground">{outlet.campaign}</td>
                    <td className="px-4 py-4 text-muted-foreground">{outlet.rep}</td>
                    <td className="px-4 py-4">
                      <Badge className={`rounded-full ${outlet.status === "Converted" ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}`}>
                        {outlet.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-4 text-muted-foreground">{new Date(outlet.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-4 text-muted-foreground">{outlet.location}</td>
                    <td className="px-4 py-4"><SyncBadge status={outlet.syncStatus} /></td>
                    <td className="px-4 py-4 text-right">
                      <Button variant="secondary" size="sm" className="rounded-full" asChild>
                        <Link href={`/admin/outlets/${outlet.id}`}>View</Link>
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
          <p>
            Showing {(query.data?.total ?? 0) === 0 ? 0 : (page - 1) * pageSize + 1}-
            {Math.min((page - 1) * pageSize + (query.data?.outlets?.length ?? 0), query.data?.total ?? 0)} of {query.data?.total ?? 0}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="rounded-full" disabled={page <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>
              Previous
            </Button>
            <Button
              variant="outline"
              className="rounded-full"
              disabled={page * pageSize >= (query.data?.total ?? 0)}
              onClick={() => setPage((prev) => prev + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function SyncBadge({ status }: { status: "pending" | "synced" | "failed" }) {
  const className = status === "synced" ? "bg-primary/10 text-primary" : status === "failed" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground";
  return <Badge className={`rounded-full capitalize hover:bg-inherit ${className}`}>{status}</Badge>;
}

