import Link from "next/link";

import AgentBackButton from "@/components/agent/AgentBackButton";
import SectionHeader from "@/components/agent/SectionHeader";
import { Button } from "@/components/ui/button";

export default function NewOutletPage() {
  return (
    <main className="space-y-4 pt-4">
      <AgentBackButton href="/agent/home" />
      <SectionHeader
        title="Register Outlet"
        subtitle="Outlet capture now runs inside campaign visit workflow."
      />
      <div className="rounded-2xl border border-border/70 bg-card p-4 text-sm text-muted-foreground">
        Start from a campaign workspace to capture GPS, select nearby outlets, and submit a full visit.
      </div>
      <Button asChild className="rounded-full"><Link href="/agent/campaigns">Go to Campaigns</Link></Button>
    </main>
  );
}
