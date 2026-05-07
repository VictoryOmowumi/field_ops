"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { authorizedFetch } from "@/lib/api/client";
import TableEmptyStateRow from "@/components/shared/TableEmptyStateRow";
import TableLoadingState from "@/components/shared/TableLoadingState";

type OutletRow = {
  id: string;
  name: string;
  type: string;
  phone: string;
  campaign: string;
  rep: string;
  location: string;
  syncStatus: "pending" | "synced" | "failed";
  createdAt: string;
};

export default function OutletsPage() {
  const query = useQuery({
    queryKey: ["admin-outlets"],
    queryFn: async () => {
      const result = await authorizedFetch<{ success: boolean; outlets: OutletRow[] }>("/api/admin/outlets");
      return result.outlets ?? [];
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
        <div className="overflow-hidden rounded-3xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Outlet</th>
                <th className="px-4 py-3 text-left font-medium">Campaign</th>
                <th className="px-4 py-3 text-left font-medium">Rep</th>
                <th className="px-4 py-3 text-left font-medium">Location</th>
                <th className="px-4 py-3 text-left font-medium">Sync</th>
                <th className="px-4 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>

            <tbody>
              {query.isLoading ? (
                <TableLoadingState colSpan={6} title="Loading outlets..." description="Fetching outlet records and sync status." />
              ) : (query.data ?? []).length === 0 ? (
                <TableEmptyStateRow colSpan={6} title="No outlets yet" description="Outlets will appear here when reps start capturing in the field." />
              ) : (
                (query.data ?? []).map((outlet) => (
                  <tr key={outlet.id} className="border-t border-border">
                    <td className="px-4 py-4">
                      <p className="font-medium">{outlet.name}</p>
                      <p className="text-xs text-muted-foreground">{outlet.type} · {outlet.phone}</p>
                    </td>
                    <td className="px-4 py-4 text-muted-foreground">{outlet.campaign}</td>
                    <td className="px-4 py-4 text-muted-foreground">{outlet.rep}</td>
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
      </section>
    </div>
  );
}

function SyncBadge({ status }: { status: "pending" | "synced" | "failed" }) {
  const className = status === "synced" ? "bg-primary/10 text-primary" : status === "failed" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground";
  return <Badge className={`rounded-full capitalize hover:bg-inherit ${className}`}>{status}</Badge>;
}

