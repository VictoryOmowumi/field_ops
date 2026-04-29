import { HugeiconsIcon } from "@hugeicons/react";
import { SaleTag01Icon } from "@hugeicons/core-free-icons";
import Link from "next/link";

import ListRowCard from "@/components/agent/ListRowCard";
import MetricCard from "@/components/agent/MetricCard";
import SectionHeader from "@/components/agent/SectionHeader";
import StatusPill from "@/components/agent/StatusPill";
import { Button } from "@/components/ui/button";
import { formatNaira, SALE_LIST } from "@/lib/agent-mock-data";

const salesMetrics = [
  { label: "Today's Sales", value: formatNaira(86400), delta: "24 units", tone: "blue" as const },
  { label: "Converted", value: "5", delta: "Top SKU: Energy 35cl", tone: "green" as const },
  { label: "Revisit", value: "2", delta: "Needs follow-up", tone: "amber" as const },
];

export default function SalesPage() {
  return (
    <main className="space-y-4 pt-4">
      <SectionHeader
        title="Sales"
        subtitle="Conversions and product movement."
        actionLabel="New Sale"
        actionHref="/agent/sales/new"
      />

      <section className="grid grid-cols-2 grow-0 gap-3">
        {salesMetrics.map((metric) => (
          <MetricCard
            key={metric.label}
            label={metric.label}
            value={metric.value}
            delta={metric.delta}
            tone={metric.tone}
          />
        ))}
      </section>

      <section className="space-y-2">
        {SALE_LIST.map((sale) => (
          <ListRowCard
            key={sale.id}
            title={sale.outletName}
            subtitle={`${sale.productName} • ${sale.quantity} pcs`}
            meta={`${sale.capturedAt} • ${formatNaira(sale.amount)}`}
            trailing={
              <div className="flex flex-col items-end gap-1">
                <StatusPill status={sale.conversionStatus} />
                <StatusPill status={sale.syncStatus} />
              </div>
            }
            leading={<HugeiconsIcon icon={SaleTag01Icon} size={14} strokeWidth={1.8} />}
          />
        ))}
      </section>

      <Button asChild className="h-11 w-full rounded-2xl text-sm font-semibold">
        <Link href="/agent/sales/new">Record New Sale</Link>
      </Button>
    </main>
  );
}
