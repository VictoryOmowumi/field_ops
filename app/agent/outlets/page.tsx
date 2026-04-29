import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon, Store01Icon } from "@hugeicons/core-free-icons";
import Link from "next/link";

import EmptyStateCard from "@/components/agent/EmptyStateCard";
import ListRowCard from "@/components/agent/ListRowCard";
import SectionHeader from "@/components/agent/SectionHeader";
import StatusPill from "@/components/agent/StatusPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OUTLET_LIST } from "@/lib/agent-mock-data";

export default function OutletsPage() {
  return (
    <main className="space-y-4 pt-4">
      <SectionHeader
        title="Outlets"
        subtitle="Coverage and registration activity."
        actionLabel="New Outlet"
        actionHref="/agent/outlets/new"
      />

      <section className="rounded-2xl border border-border/70 bg-card p-3 shadow-sm">
        <div className="relative">
          <HugeiconsIcon
            icon={Search01Icon}
            size={16}
            strokeWidth={1.8}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input className="pl-9" placeholder="Search by outlet, city, or rep" />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" className="h-7 rounded-full px-3 text-xs">
            All
          </Button>
          <Button variant="outline" size="sm" className="h-7 rounded-full px-3 text-xs">
            Synced
          </Button>
          <Button variant="outline" size="sm" className="h-7 rounded-full px-3 text-xs">
            Pending
          </Button>
          <Button variant="outline" size="sm" className="h-7 rounded-full px-3 text-xs">
            Failed
          </Button>
        </div>
      </section>

      <section className="space-y-2">
        {OUTLET_LIST.length === 0 ? (
          <EmptyStateCard title="No outlets yet" message="Start by registering your first outlet." />
        ) : (
          OUTLET_LIST.map((outlet) => (
            <ListRowCard
              key={outlet.id}
              title={outlet.name}
              subtitle={`${outlet.outletType} • ${outlet.location}`}
              meta={`Last visit: ${outlet.lastVisit}`}
              trailing={<StatusPill status={outlet.syncStatus} />}
              leading={<HugeiconsIcon icon={Store01Icon} size={14} strokeWidth={1.8} />}
            />
          ))
        )}
      </section>

      <Button asChild className="h-11 w-full rounded-2xl text-sm font-semibold">
        <Link href="/agent/outlets/new">Register New Outlet</Link>
      </Button>
    </main>
  );
}
