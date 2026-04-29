import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  ReloadIcon,
  SaleTag01Icon,
  Store01Icon,
  TimeQuarterPassIcon,
} from "@hugeicons/core-free-icons";

import ActionTile from "@/components/agent/ActionTile";
import ListRowCard from "@/components/agent/ListRowCard";
import MetricCard from "@/components/agent/MetricCard";
import SectionHeader from "@/components/agent/SectionHeader";
import StatusPill from "@/components/agent/StatusPill";
import { AGENT_PROFILE, HOME_ACTIVITIES, HOME_METRICS } from "@/lib/agent-mock-data";

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function AgentHomePage() {
  return (
    <main className="space-y-5 pt-2">
      <section className="">
        <p className="text-3xl -py-2! font-semibold ">
          <span className="text-2xl font-medium text-muted-foreground">{greeting()},</span> <br /> 
          {AGENT_PROFILE.name}!
          </p>
        <p className="mt-1 text-sm text-muted-foreground tracking-tight">Ready for today&apos;s field run?</p>
      </section>

      <section className="grid grid-cols-2 gap-3">
        {HOME_METRICS.map((metric) => (
          <MetricCard
            key={metric.label}
            label={metric.label}
            value={metric.value}
            delta={metric.delta}
            tone={metric.tone}
          />
        ))}
      </section>

      <section className="space-y-3">
        <SectionHeader title="Quick Actions" subtitle="Capture activity in two taps." />
        <div className="grid grid-cols-2 gap-3">
          <ActionTile
            title="Register Outlet"
            caption="Capture new outlet details."
            href="/agent/outlets/new"
            accent="green"
            icon={<HugeiconsIcon icon={Store01Icon} size={16} strokeWidth={1.8} />}
          />
          <ActionTile
            title="Record Sale"
            caption="Log conversion with evidence."
            href="/agent/sales/new"
            accent="blue"
            icon={<HugeiconsIcon icon={SaleTag01Icon} size={16} strokeWidth={1.8} />}
          />
          <ActionTile
            title="Sync Queue"
            caption="Retry pending records."
            href="/agent/sync"
            accent="amber"
            icon={<HugeiconsIcon icon={ReloadIcon} size={16} strokeWidth={1.8} />}
          />
          <ActionTile
            title="Add Follow-up"
            caption="Create revisit reminder."
            href="/agent/sales/new"
            accent="rose"
            icon={<HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.8} />}
          />
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeader title="Recent Activity" actionLabel="See all" actionHref="/agent/sales" />
        <div className="space-y-2">
          {HOME_ACTIVITIES.map((activity) => (
            <ListRowCard
              key={activity.id}
              title={activity.title}
              subtitle={activity.subtitle}
              meta={activity.time}
              trailing={<StatusPill status={activity.status} />}
              leading={<HugeiconsIcon icon={TimeQuarterPassIcon} size={14} strokeWidth={1.8} />}
            />
          ))}
        </div>
      </section>
    </main>
  );
}
