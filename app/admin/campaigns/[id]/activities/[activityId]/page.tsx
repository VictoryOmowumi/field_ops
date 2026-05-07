"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import OutletLocationPreviewMap from "@/components/admin/OutletLocationPreviewMap";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import EvidenceGallery from "@/components/shared/EvidenceGallery";
import { authorizedFetch } from "@/lib/api/client";

type ActivityDetail = {
  id: string;
  type: "visit" | "sale";
  outlet: string;
  actor: string;
  status: string;
  createdAt: string;
  details: Record<string, unknown>;
  evidence?: Array<{ id: string; file_url: string; created_at: string; signed_url?: string | null }>;
};

export default function AdminCampaignActivityDetailPage() {
  const params = useParams<{ id: string; activityId: string }>();
  const campaignId = params.id;
  const activityId = params.activityId;

  const query = useQuery({
    queryKey: ["admin-campaign-activity-detail", campaignId, activityId],
    queryFn: async () =>
      (await authorizedFetch<{ success: boolean; activity: ActivityDetail }>(
        `/api/admin/campaigns/${campaignId}/activities/${activityId}`
      )).activity,
  });

  if (query.error) toast.error((query.error as Error).message);

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    );
  }

  const activity = query.data;
  if (!activity) return <div className="rounded-2xl border p-4">Activity not found.</div>;

  const details = activity.details as Record<string, unknown>;
  const lat = typeof details.latitude === "number" ? details.latitude : null;
  const lng = typeof details.longitude === "number" ? details.longitude : null;
  const notes = typeof details.notes === "string" ? details.notes : "";

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <Badge className="rounded-full capitalize">{activity.type}</Badge>
            <Badge className="rounded-full capitalize">{activity.status.replaceAll("_", " ")}</Badge>
            <span className="text-sm text-muted-foreground">{activity.id}</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Activity Details</h1>
          <p className="mt-1 text-sm text-muted-foreground">{activity.outlet} · {activity.actor}</p>
        </div>
        <Button variant="outline" asChild className="rounded-full">
          <Link href={`/admin/campaigns/${campaignId}`}>Back</Link>
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60 lg:col-span-7">
          <h2 className="font-medium">Activity Information</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Capture summary and agent context.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Info label="Outlet" value={activity.outlet} />
            <Info label="Agent" value={activity.actor} />
            <Info label="Task Type" value={String(details.task_type ?? activity.type).replaceAll("_", " ")} />
            <Info label="Outcome" value={String(details.outcome ?? activity.status).replaceAll("_", " ")} />
            <Info label="Submitted At" value={new Date(activity.createdAt).toLocaleString()} />
            <Info label="Sync Status" value={String(details.sync_status ?? "synced").replaceAll("_", " ")} />
          </div>
        </section>

        <section className="rounded-4xl bg-foreground p-5 text-background shadow-sm lg:col-span-5">
          <h2 className="font-medium">Location Metadata</h2>
          <p className="mt-1 text-sm opacity-70">
            GPS details captured from field activity.
          </p>
          <div className="mt-6 space-y-3">
            <DarkInfo label="State" value={String(details.state ?? "Not captured")} />
            <DarkInfo label="LGA" value={String(details.lga ?? "Not captured")} />
            <DarkInfo label="Coordinates" value={lat !== null && lng !== null ? `${lat}, ${lng}` : "No coordinates yet"} />
            <DarkInfo label="Notes" value={notes || "No notes"} />
          </div>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <section className="z-10 h-max rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60 lg:col-span-5">
          <h2 className="font-medium">Map Preview</h2>
          <p className="mt-1 text-sm text-muted-foreground">Captured location plotted on the map.</p>
          {lat !== null && lng !== null ? (
            <OutletLocationPreviewMap
              name={activity.outlet}
              latitude={lat}
              longitude={lng}
            />
          ) : (
            <div className="mt-5 rounded-3xl border border-dashed border-border p-5 text-sm text-muted-foreground">
              No coordinates captured for this activity.
            </div>
          )}
        </section>

        <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60 lg:col-span-7">
          <h2 className="font-medium">Captured Activity Data</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Structured field data in readable format.
          </p>
          <div className="mt-4">
            <ReadableActivityPayload details={details} />
          </div>
        </section>
      </div>

      {activity.evidence && activity.evidence.length > 0 ? (
        <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
          <h2 className="font-medium">Evidence</h2>
          <p className="mt-1 text-sm text-muted-foreground">Uploaded photos for this activity.</p>
          <div className="mt-3">
            <EvidenceGallery evidence={activity.evidence} />
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl bg-background p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}

function DarkInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl bg-background/10 p-4">
      <p className="text-xs opacity-60">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}

function ReadableActivityPayload({ details }: { details: Record<string, unknown> }) {
  const taskPayload = (details.task_payload ?? {}) as {
    activities?: Array<{ activityId?: string; payload?: { products?: Array<Record<string, unknown>>; sales?: Array<Record<string, unknown>> } }>;
  };
  const activities = Array.isArray(taskPayload.activities) ? taskPayload.activities : [];

  if (activities.length === 0) {
    return (
      <pre className="max-h-96 overflow-auto rounded-2xl bg-background p-3 text-xs">
        {JSON.stringify(details, null, 2)}
      </pre>
    );
  }

  return (
    <div className="space-y-3">
      {activities.map((activity, idx) => {
        const activityId = activity.activityId ?? `activity_${idx + 1}`;
        const products = Array.isArray(activity.payload?.products) ? activity.payload.products : [];
        const sales = Array.isArray(activity.payload?.sales) ? activity.payload.sales : [];

        return (
          <div key={`${activityId}-${idx}`} className="rounded-2xl border border-border p-3">
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
                        {showAvailability(activityId) ? <td className="px-2 py-1">{row.available === true ? "Yes" : row.available === false ? "No" : "-"}</td> : null}
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
