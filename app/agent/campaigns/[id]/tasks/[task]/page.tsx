"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

import SectionHeader from "@/components/agent/SectionHeader";
import { Skeleton } from "@/components/ui/skeleton";

export default function AgentTaskRouteRedirectPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/agent/campaigns/${params.id}/visit/start`);
  }, [params.id, router]);

  return (
    <main className="space-y-4 pt-4">
      <SectionHeader title="Start Visit" subtitle="Opening guided visit workflow..." />
      <section className="rounded-2xl border border-border/70 bg-card p-4 space-y-3">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-24 w-full" />
      </section>
    </main>
  );
}
