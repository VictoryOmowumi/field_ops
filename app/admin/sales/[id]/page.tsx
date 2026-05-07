"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { authorizedFetch } from "@/lib/api/client";

export default function SaleDetailsPage() {
  const params = useParams<{ id: string }>();
  const saleId = params.id;

  const query = useQuery({
    queryKey: ["admin-sale", saleId],
    queryFn: async () => {
      const result = await authorizedFetch<{ success: boolean; sale: Record<string, unknown> }>(`/api/admin/sales/${saleId}`);
      return result.sale;
    },
  });

  if (query.error) toast.error((query.error as Error).message);
  if (query.isLoading) return <div className="rounded-4xl bg-card p-10 text-center ring-1 ring-border/60">Loading sale...</div>;
  if (!query.data) return <div className="rounded-4xl bg-card p-10 text-center ring-1 ring-border/60">Sale not found.</div>;

  const sale = query.data;

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{String(sale.product_name ?? "Sale")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{sale.created_at ? new Date(String(sale.created_at)).toLocaleString() : "-"}</p>
        </div>
        <Button variant="outline" className="rounded-full" asChild><Link href="/admin/sales">Back</Link></Button>
      </div>

      <section className="rounded-4xl bg-card p-6 shadow-sm ring-1 ring-border/60">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Info label="Quantity" value={String(sale.quantity ?? "-")} />
          <Info label="Sales value" value={formatCurrency(sale.sales_value as number | null)} />
          <Info label="Conversion status" value={String(sale.conversion_status ?? "-")} />
          <Info label="Sync status" value={String(sale.sync_status ?? "-")} />
          <Info label="Outlet" value={String((sale as { outlets?: { name?: string } }).outlets?.name ?? "-")} />
          <Info label="Campaign" value={String((sale as { campaigns?: { name?: string } }).campaigns?.name ?? "-")} />
        </div>
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-background p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-medium">{value}</p></div>;
}

function formatCurrency(value: number | null) {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(value);
}

