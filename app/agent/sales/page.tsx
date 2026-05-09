"use client";

import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import ListRowCard from "@/components/agent/ListRowCard";
import SectionHeader from "@/components/agent/SectionHeader";
import StatusPill from "@/components/agent/StatusPill";
import { Skeleton } from "@/components/ui/skeleton";
import { authorizedFetch } from "@/lib/api/client";

type Submission = {
  id: string;
  taskType?: string | null;
  outcome: string;
  outcomeLabel?: string | null;
  notes?: string | null;
  state?: string | null;
  lga?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  createdAt: string;
  outlet: string;
  campaign: string;
  syncStatus: "pending" | "synced" | "failed";
};

export default function SalesPage() {
  const query = useQuery({
    queryKey: ["agent-submissions"],
    queryFn: async () =>
      (await authorizedFetch<{ success: boolean; submissions: Submission[] }>("/api/agent/submissions")).submissions ?? [],
  });
  if (query.error) toast.error((query.error as Error).message);

  return (
    <main className="space-y-4 pt-4">
      <SectionHeader title="My Activity" subtitle="Recent visit submissions and outcomes." />
      <section className="space-y-2">
        {query.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-2xl" />
          </div>
        ) : null}
        {(query.data ?? []).map((item) => (
          <ListRowCard
            key={item.id}
            href={`/agent/sales/${item.id}`}
            title={item.outlet}
            subtitle={[
              item.campaign,
              toTaskLabel(item.taskType),
              item.outcomeLabel || toOutcomeLabel(item.outcome),
              [item.lga, item.state].filter(Boolean).join(", "),
            ]
              .filter(Boolean)
              .join(" · ")}
            meta={new Date(item.createdAt).toLocaleString()}
            trailing={<StatusPill status={item.syncStatus} />}
          />
        ))}
        {!query.isLoading && (query.data ?? []).length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            No submissions yet.
          </p>
        ) : null}
      </section>
    </main>
  );
}

function toTaskLabel(taskType?: string | null) {
  if (!taskType) return "Visit";
  if (taskType === "sell_to_outlet") return "Sales Capture";
  if (taskType === "revisit_outlet") return "Outlet Revisit";
  if (taskType === "register_outlet") return "Outlet Registration";
  if (taskType === "availability_survey") return "Availability Check";
  if (taskType === "price_survey") return "Price Check";
  if (taskType === "product_survey") return "Product Audit";
  return "Visit";
}

function toOutcomeLabel(outcome: string) {
  if (outcome === "converted") return "Products sold";
  if (outcome === "pending") return "Pending sync";
  if (outcome === "revisit") return "Revisit required";
  if (outcome === "no_sale") return "Customer refused";
  if (outcome === "registered_only") return "Visit completed";
  return outcome.replaceAll("_", " ");
}
