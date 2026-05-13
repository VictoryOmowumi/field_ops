"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { authorizedFetch } from "@/lib/api/client";

const OutletLocationPreviewMap = dynamic(() => import("@/components/admin/OutletLocationPreviewMap"), {
  ssr: false,
});

type OutletVisit = {
  id: string;
  campaign_id?: string | null;
  task_type?: string | null;
  outcome?: string | null;
  notes?: string | null;
  state?: string | null;
  lga?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  location_accuracy?: number | null;
  created_at?: string | null;
  agent_name?: string | null;
  task_payload?: unknown;
  evidence?: Array<{
    id: string;
    file_name?: string | null;
    signed_url?: string | null;
    created_at?: string | null;
  }>;
  sales?: Array<{
    id: string;
    product_name?: string | null;
    quantity?: number | null;
    sales_value?: number | null;
  }>;
};

type OutletPayload = {
  id: string;
  name?: string | null;
  outlet_type?: string | null;
  contact_person?: string | null;
  phone?: string | null;
  address?: string | null;
  state?: string | null;
  lga?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  location_accuracy?: number | null;
  sync_status?: string | null;
  created_at?: string | null;
  campaigns?: { name?: string | null } | Array<{ name?: string | null }>;
  visits?: OutletVisit[];
};

export default function OutletDetailsPage() {
  const params = useParams<{ id: string }>();
  const outletId = params.id;
  const [previewImage, setPreviewImage] = useState<{ src: string; name: string } | null>(null);

  const query = useQuery({
    queryKey: ["admin-outlet", outletId],
    queryFn: async () =>
      (
        await authorizedFetch<{ success: boolean; outlet: OutletPayload }>(
          `/api/admin/outlets/${outletId}`
        )
      ).outlet,
  });
  if (query.error) toast.error((query.error as Error).message);

  if (query.isLoading) {
    return (
      <div className="space-y-5 pb-10">
        <Skeleton className="h-28 w-full rounded-4xl" />
        <Skeleton className="h-72 w-full rounded-4xl" />
        <Skeleton className="h-72 w-full rounded-4xl" />
      </div>
    );
  }

  if (!query.data) {
    return (
      <div className="rounded-4xl bg-card p-10 text-center ring-1 ring-border/60">
        Outlet not found.
      </div>
    );
  }

  const outlet = query.data;
  const visits = outlet.visits ?? [];
  const latestVisit = visits[0];
  const registeredAt = outlet.created_at ? new Date(outlet.created_at).toLocaleString() : "No timestamp yet";
  const campaignName = Array.isArray(outlet.campaigns)
    ? outlet.campaigns[0]?.name
    : outlet.campaigns?.name;
  const repName = latestVisit?.agent_name ?? "No visit submission yet";
  const supervisorName = "Not linked yet";
  const statusLabel = formatStatus(latestVisit?.outcome ?? "pending");
  const lat = outlet.latitude ?? latestVisit?.latitude ?? null;
  const lng = outlet.longitude ?? latestVisit?.longitude ?? null;

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <StatusBadge status={statusLabel} />
            <span className="text-sm text-muted-foreground">{outlet.id}</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">{outlet.name ?? "Outlet"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {outlet.outlet_type ?? "Outlet type pending"} · {outlet.address ?? "Address not captured"}
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="rounded-full" asChild>
            <Link href="/admin/outlets">Back</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60 lg:col-span-7">
          <h2 className="font-medium">Outlet Information</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Contact, campaign, and assignment details.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Info label="Contact person" value={outlet.contact_person ?? "No contact yet"} />
            <Info label="Phone number" value={outlet.phone ?? "No phone yet"} />
            <Info label="Campaign" value={campaignName ?? "No campaign linked"} />
            <Info label="Registered by" value={repName} />
            <Info label="Supervisor" value={supervisorName} />
            <Info label="Registered at" value={registeredAt} />
          </div>
        </section>

        <section className="rounded-4xl bg-foreground p-5 text-background shadow-sm lg:col-span-5">
          <h2 className="font-medium">Location Metadata</h2>
          <p className="mt-1 text-sm opacity-70">
            GPS details captured from the field.
          </p>

          <div className="mt-6 space-y-3">
            <DarkInfo label="State" value={outlet.state ?? latestVisit?.state ?? "Not captured"} />
            <DarkInfo label="LGA" value={outlet.lga ?? latestVisit?.lga ?? "Not captured"} />
            <DarkInfo label="Coordinates" value={(lat !== null && lng !== null) ? `${lat}, ${lng}` : "No coordinates yet"} />
            <DarkInfo label="GPS accuracy" value={outlet.location_accuracy ? `${outlet.location_accuracy}m` : (latestVisit?.location_accuracy ? `${latestVisit.location_accuracy}m` : "No accuracy yet")} />
            <DarkInfo label="Sync status" value={outlet.sync_status ?? "pending"} />
          </div>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60 lg:col-span-5">
          <h2 className="font-medium">Map Preview</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Approximate outlet capture location.
          </p>

          <div className="relative mt-5 h-72 overflow-hidden rounded-3xl border border-border bg-background">
            {lat !== null && lng !== null ? (
              <OutletLocationPreviewMap
                name={outlet.name ?? "Outlet"}
                latitude={lat}
                longitude={lng}
                accuracyMeters={outlet.location_accuracy ?? latestVisit?.location_accuracy ?? 18}
              />
            ) : (
              <div className="grid h-full place-items-center text-sm text-muted-foreground">
                Coordinates pending
              </div>
            )}
          </div>
        </section>

        <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60 lg:col-span-7">
          <h2 className="font-medium">Activity Timeline</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Field events linked to this outlet.
          </p>

          <div className="mt-6 space-y-4">
            {visits.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">
                No visit activities yet.
              </div>
            ) : (
              visits.map((visit) => {
                const capturedDetails = summarizeVisitPayload(visit);
                return (
                  <div key={visit.id} className="rounded-3xl border border-border bg-background p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">
                          {formatTask(visit.task_type)} · {formatStatus(visit.outcome)}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {visit.notes?.trim() || "No additional notes."}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {visit.created_at ? new Date(visit.created_at).toLocaleTimeString() : "-"}
                      </span>
                    </div>
                    {visit.campaign_id ? (
                      <div className="mt-2">
                        <Link
                          href={`/admin/campaigns/${visit.campaign_id}/activities/visit-${visit.id}`}
                          className="text-xs font-medium text-primary underline"
                        >
                          View campaign activity details
                        </Link>
                      </div>
                    ) : null}

                    {(visit.sales?.length ?? 0) > 0 ? (
                      <div className="mt-3 rounded-2xl border border-border p-3">
                        <p className="text-xs text-muted-foreground">Sales recorded</p>
                        <div className="mt-1 space-y-1">
                          {visit.sales?.map((sale) => (
                            <p key={sale.id} className="text-sm">
                              {sale.product_name ?? "Product"} · Qty {sale.quantity ?? 0}
                              {sale.sales_value ? ` · NGN ${sale.sales_value}` : ""}
                            </p>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {capturedDetails.length > 0 ? (
                      <div className="mt-3 rounded-2xl border border-border p-3">
                        <p className="text-xs text-muted-foreground">Captured details</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {capturedDetails.map((item, index) => (
                            <span key={`${visit.id}-summary-${index}`} className="rounded-full bg-muted px-2.5 py-1 text-xs">
                              {item}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-3">
                      <p className="text-xs text-muted-foreground">Photo Evidence</p>
                      {(visit.evidence?.length ?? 0) === 0 ? (
                        <p className="mt-1 text-sm text-muted-foreground">No photos uploaded for this visit.</p>
                      ) : (
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          {visit.evidence?.map((photo) => (
                            <button
                              key={photo.id}
                              type="button"
                              onClick={() => {
                                if (!photo.signed_url) return;
                                setPreviewImage({
                                  src: photo.signed_url,
                                  name: photo.file_name ?? "Uploaded image",
                                });
                              }}
                              className="overflow-hidden rounded-2xl border border-border text-left hover:bg-muted/30 disabled:opacity-50"
                              disabled={!photo.signed_url}
                            >
                              <div className="h-28 w-full bg-muted/30">
                                {photo.signed_url ? (
                                  <img
                                    src={photo.signed_url}
                                    alt={photo.file_name ?? "Evidence preview"}
                                    className="h-full w-full object-cover"
                                  />
                                ) : null}
                              </div>
                              <p className="truncate px-3 py-2 text-sm">{photo.file_name ?? "Uploaded image"}</p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      <Dialog open={Boolean(previewImage)} onOpenChange={(open) => !open && setPreviewImage(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{previewImage?.name ?? "Evidence preview"}</DialogTitle>
          </DialogHeader>
          {previewImage ? (
            <div className="max-h-[70vh] overflow-auto rounded-2xl border border-border">
              <img src={previewImage.src} alt={previewImage.name} className="h-auto w-full object-contain" />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
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

function StatusBadge({ status }: { status: string }) {
  const className =
    status === "Converted"
      ? "bg-primary/10 text-primary"
      : status === "Pending"
        ? "bg-muted text-muted-foreground"
        : "bg-secondary text-secondary-foreground";

  return (
    <Badge className={`rounded-full hover:bg-inherit ${className}`}>
      {status}
    </Badge>
  );
}

function formatTask(taskType?: string | null) {
  if (!taskType) return "Visit submission";
  return taskType.replaceAll("_", " ");
}

function formatStatus(status?: string | null) {
  if (!status) return "Pending";
  if (status === "registered_only") return "Registered Only";
  if (status === "converted") return "Converted";
  if (status === "revisit") return "Revisit";
  if (status === "no_sale") return "No Sale";
  if (status === "no_interest") return "No Interest";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function summarizeVisitPayload(visit: OutletVisit) {
  const payload = visit.task_payload as
    | {
        activities?: Array<{
          activityId?: string;
          payload?: Record<string, unknown>;
        }>;
      }
    | undefined;
  const activities = payload?.activities ?? [];
  if (activities.length === 0) return [];

  const summary: string[] = [];
  for (const item of activities) {
    const activityId = item.activityId ?? "";
    const activityPayload = item.payload ?? {};
    if (activityId === "availability_survey") {
      const products = Array.isArray(activityPayload.products) ? activityPayload.products : [];
      const availableCount = products.filter((product) => Boolean((product as { available?: boolean }).available)).length;
      summary.push(`Availability: ${availableCount}/${products.length || 0} in stock`);
      continue;
    }
    if (activityId === "price_survey") {
      const products = Array.isArray(activityPayload.products) ? activityPayload.products : [];
      summary.push(`Prices captured: ${products.length}`);
      continue;
    }
    if (activityId === "product_survey") {
      const products = Array.isArray(activityPayload.products) ? activityPayload.products : [];
      const qty = products.reduce((acc, product) => acc + Number((product as { quantity?: number }).quantity ?? 0), 0);
      summary.push(`Quantity recorded: ${qty}`);
      continue;
    }
    if (activityId === "posm_deployment") {
      const deployed = Boolean(activityPayload.deployed);
      const qty = Number(activityPayload.quantity ?? 0);
      summary.push(deployed ? `POSM deployed: ${qty}` : "POSM not deployed");
      continue;
    }
    if (activityId === "register_outlet") {
      summary.push("Outlet registration captured");
      continue;
    }
    if (activityId === "sell_to_outlet") {
      const qty = Number(activityPayload.quantity ?? 0);
      const price = Number(activityPayload.price ?? 0);
      summary.push(`Sale captured: Qty ${qty}${price > 0 ? ` · NGN ${price}` : ""}`);
      continue;
    }
  }
  return summary.slice(0, 6);
}
