import MetricCard from "@/components/agent/MetricCard";
import SectionHeader from "@/components/agent/SectionHeader";
import StatusPill from "@/components/agent/StatusPill";
import { PROFILE_METRICS, PROFILE_PREFERENCES, AGENT_PROFILE } from "@/lib/agent-mock-data";

export default function ProfilePage() {
  return (
    <main className="space-y-4 pt-4">
      <SectionHeader title="Profile" subtitle="Account and field preferences." />

      <section className="rounded-3xl border border-border/70 bg-card p-4 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">{AGENT_PROFILE.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {AGENT_PROFILE.role} • {AGENT_PROFILE.territory}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <StatusPill status="online" />
          <StatusPill status="synced" />
        </div>
        <div className="mt-4 space-y-1 text-xs text-muted-foreground">
          <p>{AGENT_PROFILE.phone}</p>
          <p>{AGENT_PROFILE.email}</p>
        </div>
      </section>

      <section className="grid grid-cols-3 gap-3">
        {PROFILE_METRICS.map((metric) => (
          <MetricCard
            key={metric.label}
            label={metric.label}
            value={metric.value}
            delta={metric.delta}
            tone={metric.tone}
          />
        ))}
      </section>

      <section className="rounded-2xl border border-border/70 bg-card p-3 shadow-sm">
        <SectionHeader title="Preferences" subtitle="Field capture behavior and reminders." />
        <div className="mt-3 space-y-3">
          {PROFILE_PREFERENCES.map((item) => (
            <div key={item.id} className="flex items-start justify-between gap-3 rounded-xl bg-muted/50 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{item.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
              </div>
              <StatusPill status={item.enabled ? "synced" : "offline"} />
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
