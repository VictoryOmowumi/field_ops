"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { authorizedFetch } from "@/lib/api/client";
import TableEmptyStateRow from "@/components/shared/TableEmptyStateRow";
import TableLoadingState from "@/components/shared/TableLoadingState";

type SaleRow = {
  id: string;
  product: string;
  outlet: string;
  rep: string;
  campaign: string;
  quantity: number;
  value: number | null;
  status: "converted" | "pending" | "revisit";
  syncStatus: "pending" | "synced" | "failed";
  time: string;
};

export default function SalesPage() {
  const query = useQuery({
    queryKey: ["admin-sales"],
    queryFn: async () => {
      const result = await authorizedFetch<{ success: boolean; sales: SaleRow[] }>("/api/admin/sales");
      return result.sales ?? [];
    },
  });

  if (query.error) toast.error((query.error as Error).message);

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Sales Activity</h1>
          <p className="mt-1 text-sm text-muted-foreground">Review sales conversions and sync health.</p>
        </div>
      </div>

      <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <div className="overflow-hidden rounded-3xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Sale</th>
                <th className="px-4 py-3 text-left font-medium">Outlet</th>
                <th className="px-4 py-3 text-left font-medium">Rep</th>
                <th className="px-4 py-3 text-left font-medium">Campaign</th>
                <th className="px-4 py-3 text-left font-medium">Qty</th>
                <th className="px-4 py-3 text-left font-medium">Value</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Sync</th>
                <th className="px-4 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>

            <tbody>
              {query.isLoading ? (
                <TableLoadingState colSpan={9} title="Loading sales..." description="Fetching recent sales activity." />
              ) : (query.data ?? []).length === 0 ? (
                <TableEmptyStateRow colSpan={9} title="No sales records yet" description="Sales captured by reps will appear here." />
              ) : (
                (query.data ?? []).map((sale) => (
                  <tr key={sale.id} className="border-t border-border">
                    <td className="px-4 py-4">
                      <p className="font-medium">{sale.product}</p>
                      <p className="text-xs text-muted-foreground">{new Date(sale.time).toLocaleString()}</p>
                    </td>
                    <td className="px-4 py-4 text-muted-foreground">{sale.outlet}</td>
                    <td className="px-4 py-4 text-muted-foreground">{sale.rep}</td>
                    <td className="px-4 py-4 text-muted-foreground">{sale.campaign}</td>
                    <td className="px-4 py-4 font-medium">{sale.quantity}</td>
                    <td className="px-4 py-4 font-medium">{formatCurrency(sale.value)}</td>
                    <td className="px-4 py-4"><StatusBadge status={sale.status} /></td>
                    <td className="px-4 py-4"><SyncBadge status={sale.syncStatus} /></td>
                    <td className="px-4 py-4 text-right">
                      <Button variant="secondary" size="sm" className="rounded-full" asChild>
                        <Link href={`/admin/sales/${sale.id}`}>View</Link>
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

function formatCurrency(value: number | null) {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(value);
}

function StatusBadge({ status }: { status: "converted" | "pending" | "revisit" }) {
  const className = status === "converted" ? "bg-primary/10 text-primary" : status === "pending" ? "bg-muted text-muted-foreground" : "bg-secondary text-secondary-foreground";
  return <Badge className={`rounded-full capitalize hover:bg-inherit ${className}`}>{status}</Badge>;
}

function SyncBadge({ status }: { status: "pending" | "synced" | "failed" }) {
  const className = status === "synced" ? "bg-primary/10 text-primary" : status === "failed" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground";
  return <Badge className={`rounded-full capitalize hover:bg-inherit ${className}`}>{status}</Badge>;
}

