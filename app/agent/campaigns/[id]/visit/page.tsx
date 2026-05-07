import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function LegacyVisitRoutePage() {
  return (
    <main className="space-y-4 pt-4">
      <div className="rounded-2xl border border-border/70 bg-card p-4">
        <p className="font-medium">Visit flow has moved</p>
        <p className="mt-1 text-sm text-muted-foreground">Use the task-based capture pages from campaign workspace.</p>
      </div>
      <Button asChild className="rounded-full"><Link href="/agent/campaigns">Go to Campaigns</Link></Button>
    </main>
  );
}

