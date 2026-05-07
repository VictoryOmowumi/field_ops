"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import UserStatusBadge from "@/components/admin/UserStatusBadge";
import { Button } from "@/components/ui/button";
import { authorizedFetch } from "@/lib/api/client";
import TableEmptyStateRow from "@/components/shared/TableEmptyStateRow";
import TableLoadingState from "@/components/shared/TableLoadingState";

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
};

export default function RepsPage() {
  const query = useQuery({
    queryKey: ["admin-reps"],
    queryFn: async () => {
      const result = await authorizedFetch<{ success: boolean; reps: Rep[] }>("/api/admin/reps");
      return result.reps ?? [];
    },
  });

  if (query.error) toast.error((query.error as Error).message);

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Sales Reps</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage field agents and campaign assignments.</p>
        </div>
        <Button asChild className="rounded-full px-5"><Link href="/admin/reps/new">Add Rep</Link></Button>
      </div>

      <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <div className="overflow-hidden rounded-3xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Rep</th>
                <th className="px-4 py-3 text-left font-medium">Campaigns</th>
                <th className="px-4 py-3 text-left font-medium">Territory</th>
                <th className="px-4 py-3 text-left font-medium">Targets</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {query.isLoading ? (
               <TableLoadingState colSpan={6} title="Loading sales reps..." description="Fetching the latest data for your team." />
              ) : (query.data ?? []).length === 0 ? (
                <TableEmptyStateRow colSpan={6} title="No sales reps found" description="Add sales reps to assign them to campaigns and territories." />
              ) : (
                (query.data ?? []).map((rep) => (
                  <tr key={rep.id} className="border-t border-border">
                    <td className="px-4 py-4">
                      <p className="font-medium">{rep.displayName}</p>
                      <p className="text-xs text-muted-foreground">{rep.repCode} · {rep.phone ?? "-"}</p>
                    </td>
                    <td className="px-4 py-4 text-muted-foreground">
                      {rep.campaigns.length ? rep.campaigns.map((c) => c.name).join(", ") : "-"}
                    </td>
                    <td className="px-4 py-4 text-muted-foreground">{rep.territory || "-"}</td>
                    <td className="px-4 py-4 text-muted-foreground">
                      {rep.targetOutlets ?? "-"} outlets / {rep.targetConversions ?? "-"} conv
                    </td>
                    <td className="px-4 py-4"><UserStatusBadge status={rep.status} /></td>
                    <td className="px-4 py-4 text-right">
                      <Button variant="secondary" size="sm" className="rounded-full" asChild>
                        <Link href={`/admin/reps/${rep.id}`}>View</Link>
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

