"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import AgentBackButton from "@/components/agent/AgentBackButton";
import SectionHeader from "@/components/agent/SectionHeader";
import StatusPill from "@/components/agent/StatusPill";
import { Skeleton } from "@/components/ui/skeleton";
import EvidenceGallery from "@/components/shared/EvidenceGallery";
import { authorizedFetch } from "@/lib/api/client";

type SubmissionDetail = {
  id: string;
  campaign: string;
  outlet: string;
  taskType?: string | null;
  outcome: string;
  outcomeLabel?: string | null;
  notes?: string | null;
  payload?: unknown;
  state?: string | null;
  lga?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  syncStatus: "pending" | "synced" | "failed";
  createdAt: string;
  evidence: Array<{ id: string; file_url: string; created_at: string; signed_url?: string | null }>;
};

export default function AgentSubmissionDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const query = useQuery({
    queryKey: ["agent-submission-detail", id],
    queryFn: async () =>
      (await authorizedFetch<{ success: boolean; submission: SubmissionDetail }>(`/api/agent/submissions/${id}`)).submission,
  });

  if (query.error) toast.error((query.error as Error).message);

  if (query.isLoading) {
    return (
      <main className="space-y-3 pt-4">
        <AgentBackButton href="/agent/campaigns" />
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </main>
    );
  }

  const item = query.data;
  if (!item) {
    return (
      <main className="space-y-4 pt-4">
        <AgentBackButton href="/agent/campaigns" />
        <SectionHeader title="Activity Details" subtitle="Submission not found." />
      </main>
    );
  }

  return (
    <main className="space-y-4 pt-4">
      <AgentBackButton href="/agent/campaigns" />
      <SectionHeader title="Activity Details" subtitle={item.outlet} />

      <section className="space-y-2 rounded-2xl border border-border/70 bg-card p-4">
        <p className="text-sm font-medium">{item.campaign}</p>
        <p className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</p>
        <div className="pt-1"><StatusPill status={item.syncStatus} /></div>
        <p className="text-xs text-muted-foreground">
          {item.outcomeLabel || item.outcome.replaceAll("_", " ")}
        </p>
        <p className="text-xs text-muted-foreground">
          {[item.lga, item.state].filter(Boolean).join(", ") || "No area"}
        </p>
      </section>

      <section className="space-y-2 rounded-2xl border border-border/70 bg-card p-4">
        <h3 className="text-sm font-medium">Captured Data</h3>
        <ReadablePayload payload={item.payload} />
      </section>

      <section className="space-y-2 rounded-2xl border border-border/70 bg-card p-4">
        <h3 className="text-sm font-medium">Evidence</h3>
        <EvidenceGallery evidence={item.evidence} />
      </section>
    </main>
  );
}

function ReadablePayload({ payload }: { payload?: unknown }) {
  const data = (payload ?? {}) as {
    activities?: Array<{ activityId?: string; payload?: { products?: Array<Record<string, unknown>>; sales?: Array<Record<string, unknown>> } }>;
  };
  const activities = Array.isArray(data.activities) ? data.activities : [];
  if (activities.length === 0) {
    return <p className="text-xs text-muted-foreground">No structured payload.</p>;
  }

  return (
    <div className="space-y-3">
      {activities.map((activity, idx) => {
        const activityId = activity.activityId ?? `activity_${idx + 1}`;
        const products = Array.isArray(activity.payload?.products) ? activity.payload?.products : [];
        const sales = Array.isArray(activity.payload?.sales) ? activity.payload?.sales : [];

        return (
          <div key={`${activityId}-${idx}`} className="rounded-xl border border-border/70 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {activityId.replaceAll("_", " ")}
            </p>

            {products.length > 0 ? (
              <div className="mt-2 overflow-hidden rounded-lg border border-border/70">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="px-2 py-1 text-left font-medium">Product</th>
                      {showAvailability(activityId) ? <th className="px-2 py-1 text-left font-medium">Availability</th> : null}
                      {showQuantity(activityId) ? <th className="px-2 py-1 text-left font-medium">Qty</th> : null}
                      {showBuying(activityId) ? <th className="px-2 py-1 text-left font-medium">Buying</th> : null}
                      {showSelling(activityId) ? <th className="px-2 py-1 text-left font-medium">Selling</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((row, rowIndex) => (
                      <tr key={`${activityId}-p-${rowIndex}`} className="border-t border-border/60">
                        <td className="px-2 py-1">{String(row.productName ?? "-")}</td>
                        {showAvailability(activityId) ? (
                          <td className="px-2 py-1">
                            {row.available === true ? "Yes" : row.available === false ? "No" : "-"}
                          </td>
                        ) : null}
                        {showQuantity(activityId) ? <td className="px-2 py-1">{formatCellValue(row.quantity)}</td> : null}
                        {showBuying(activityId) ? <td className="px-2 py-1">{formatCellValue(row.buyingPrice)}</td> : null}
                        {showSelling(activityId) ? <td className="px-2 py-1">{formatCellValue(row.sellingPrice)}</td> : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {sales.length > 0 ? (
              <div className="mt-2 overflow-hidden rounded-lg border border-border/70">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="px-2 py-1 text-left font-medium">Product</th>
                      <th className="px-2 py-1 text-left font-medium">Qty</th>
                      <th className="px-2 py-1 text-left font-medium">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.map((row, rowIndex) => (
                      <tr key={`${activityId}-s-${rowIndex}`} className="border-t border-border/60">
                        <td className="px-2 py-1">{String(row.productName ?? "-")}</td>
                        <td className="px-2 py-1">{formatCellValue(row.quantity)}</td>
                        <td className="px-2 py-1">{formatCellValue(row.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function formatCellValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
    return String(value);
  }
  return "-";
}

function showAvailability(activityId: string) {
  return activityId === "availability_survey" || activityId === "product_survey";
}
function showQuantity(activityId: string) {
  return activityId === "product_survey";
}
function showBuying(activityId: string) {
  return activityId === "price_survey";
}
function showSelling(activityId: string) {
  return activityId === "price_survey";
}
