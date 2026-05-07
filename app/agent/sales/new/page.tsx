import Link from "next/link";

import SectionHeader from "@/components/agent/SectionHeader";
import { Button } from "@/components/ui/button";

export default function NewSalePage() {
  return (
    <main className="space-y-4 pt-4">
      <SectionHeader
        title="Record Sale"
        subtitle="Sales are captured as part of a visit workflow."
      />
      <div className="rounded-2xl border border-border/70 bg-card p-4 text-sm text-muted-foreground">
        Open an assigned campaign and start a visit to record sale facts and evidence.
      </div>
      <Button asChild className="rounded-full"><Link href="/agent/campaigns">Go to Campaigns</Link></Button>
    </main>
  );
}

