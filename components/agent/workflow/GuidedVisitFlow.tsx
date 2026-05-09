"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { nigeriaLocations } from "@/data/nigeria-locations";
import type { CampaignWorkflowConfigV1, WorkflowSubmissionPayload } from "@/types/workflow";
import type { NearbyOutlet } from "@/types/campaign-form";

type Props = {
  campaignId: string;
  workflow: CampaignWorkflowConfigV1;
  outletTypes?: string[];
  productOptions?: Array<{ sku?: string; name?: string }>;
  stateName?: string | null;
  nearbyOutlets: NearbyOutlet[];
  gps: { latitude?: number; longitude?: number; locationAccuracy?: number };
  isOnline: boolean;
  onSubmit: (payload: WorkflowSubmissionPayload, photos: File[]) => Promise<void>;
};

type SaleRow = { productName: string; quantity: number; price?: number };
type ProductAuditRow = {
  productName: string;
  available?: "yes" | "no";
  quantity?: number;
  buyingPrice?: number;
  sellingPrice?: number;
};

export default function GuidedVisitFlow({
  campaignId,
  workflow,
  outletTypes = [],
  productOptions = [],
  stateName,
  nearbyOutlets,
  gps,
  isOnline,
  onSubmit,
}: Props) {
  const stableSubmissionKeyRef = useRef<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [outletName, setOutletName] = useState("");
  const [areaLga, setAreaLga] = useState("");
  const [outletAddress, setOutletAddress] = useState("");

  const [outcomeCode, setOutcomeCode] = useState<string>("");
  const [sales, setSales] = useState<SaleRow[]>([{ productName: productOptions[0]?.name ?? "", quantity: 1 }]);
  const [productAudit, setProductAudit] = useState<ProductAuditRow[]>(
    productOptions.map((item) => ({ productName: item.name ?? item.sku ?? "" }))
  );
  const [notes, setNotes] = useState("");
  const [posmDeployed, setPosmDeployed] = useState<"yes" | "no" | "">("");
  const [posmQuantity, setPosmQuantity] = useState<number | undefined>(undefined);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const lgaOptions = useMemo(() => {
    const found = nigeriaLocations.find((item) => item.state === (stateName ?? ""));
    return found?.lgas ?? [];
  }, [stateName]);

  const hasSalesStep = workflow.activities.some((item) => item.id === "sell_to_outlet");
  const hasAvailability = workflow.activities.some((item) => item.id === "availability_survey");
  const hasPriceSurvey = workflow.activities.some((item) => item.id === "price_survey");
  const hasProductSurvey = workflow.activities.some((item) => item.id === "product_survey");
  const posmActivity = workflow.activities.find((item) => item.id === "posm_deployment");
  const hasPosmDeployment = Boolean(posmActivity);
  const requirePosmQuantityWhenDeployed = Boolean(posmActivity?.settings?.requireQuantityWhenDeployed);
  const hasValidSales = sales.some((row) => row.productName.trim() && row.quantity > 0);
  const resolvedOutcomeCode = outcomeCode || (hasSalesStep ? "products_sold" : "follow_up_needed");
  const isSoldOutcome = resolvedOutcomeCode === "products_sold";
  const gpsRequired = workflow.validationRules.requireGpsBeforeSubmit;
  const hasGps = typeof gps.latitude === "number" && typeof gps.longitude === "number";

  const availableOutcomeCodes = useMemo(
    () => new Set(workflow.agentCopy.outcomes.map((item) => item.code)),
    [workflow.agentCopy.outcomes]
  );

  async function submitNow() {
    if (!customerName.trim()) return toast.error("Customer name is required.");
    if (!customerPhone.trim()) return toast.error("Customer phone is required.");
    if (!outletName.trim()) return toast.error("Outlet name is required.");
    if (!areaLga.trim()) return toast.error("LGA is required.");
    if (!outletAddress.trim()) return toast.error("Outlet address is required.");
    if (gpsRequired && !hasGps) return toast.error("GPS capture is required. Wait for location and retry.");

    if (workflow.validationRules.requirePhotoEvidence && files.length < workflow.validationRules.minimumPhotos) {
      toast.error(`At least ${workflow.validationRules.minimumPhotos} photo(s) are required.`);
      return;
    }

    if (hasSalesStep && resolvedOutcomeCode === "products_sold" && !hasValidSales) {
      toast.error("Add at least one valid sale row.");
      return;
    }

    if ((hasPriceSurvey || hasProductSurvey || hasAvailability) && productAudit.length === 0) {
      toast.error("At least one product audit row is required.");
      return;
    }
    if (hasPosmDeployment && !posmDeployed) {
      toast.error("Please select whether POSM was deployed.");
      return;
    }
    if (hasPosmDeployment && posmDeployed === "yes" && requirePosmQuantityWhenDeployed && (!posmQuantity || posmQuantity < 1)) {
      toast.error("Enter POSM quantity when deployment is marked yes.");
      return;
    }
    if (!stableSubmissionKeyRef.current) {
      stableSubmissionKeyRef.current =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? `wf-${crypto.randomUUID()}`
          : `wf-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }

    const outcomeLabel = workflow.agentCopy.outcomes.find((item) => item.code === resolvedOutcomeCode)?.label ?? "Follow-up needed";

    const activityPayloads: WorkflowSubmissionPayload["activityPayloads"] = [];

    if (hasSalesStep) {
      activityPayloads.push({
        activityId: "sell_to_outlet",
        payload: { sales: resolvedOutcomeCode === "products_sold" ? sales.filter((row) => row.productName.trim() && row.quantity > 0) : [] },
      });
    }

    if (hasAvailability) {
      activityPayloads.push({
        activityId: "availability_survey",
        payload: {
          products: productAudit.map((row) => ({ productName: row.productName, available: row.available === "yes" })),
        },
      });
    }

    if (hasPriceSurvey) {
      activityPayloads.push({
        activityId: "price_survey",
        payload: {
          products: productAudit.map((row) => ({
            productName: row.productName,
            buyingPrice: row.buyingPrice,
            sellingPrice: row.sellingPrice,
          })),
        },
      });
    }

    if (hasProductSurvey) {
      activityPayloads.push({
        activityId: "product_survey",
        payload: {
          products: productAudit.map((row) => ({
            productName: row.productName,
            quantity: row.quantity,
            available: row.available === "yes",
          })),
        },
      });
    }

    if (notes.trim()) {
      activityPayloads.push({ activityId: "notes", payload: { notes: notes.trim() } });
    }
    if (hasPosmDeployment) {
      activityPayloads.push({
        activityId: "posm_deployment",
        payload: {
          deployed: posmDeployed === "yes",
          quantity: posmDeployed === "yes" ? posmQuantity ?? null : null,
        },
      });
    }

    const payload: WorkflowSubmissionPayload = {
      campaignId,
      idempotencyKey: stableSubmissionKeyRef.current ?? undefined,
      selectedOutletRef: {
        mode: "new",
        outlet: {
          name: outletName.trim(),
          outletType: outletTypes[0]?.trim() || undefined,
          contactPerson: customerName.trim(),
          phone: customerPhone.trim(),
          address: outletAddress.trim(),
          state: stateName ?? undefined,
          lga: areaLga.trim(),
        },
      },
      activityPayloads,
      outcome: {
        code: availableOutcomeCodes.has(resolvedOutcomeCode as never) ? (resolvedOutcomeCode as never) : "follow_up_needed",
        label: outcomeLabel,
      },
      gps,
      photos: files.map((file) => ({ fileName: file.name })),
      clientSubmissionMeta: { singlePageMode: true },
      syncStatus: isOnline ? "synced" : "pending",
    };

    setSubmitting(true);
    try {
      await onSubmit(payload, files);
      setConfirmOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit visit.");
    } finally {
      setSubmitting(false);
    }
  }

  function submit() {
    if (!customerName.trim()) return toast.error("Customer name is required.");
    if (!customerPhone.trim()) return toast.error("Customer phone is required.");
    if (!outletName.trim()) return toast.error("Outlet name is required.");
    if (!areaLga.trim()) return toast.error("LGA is required.");
    if (!outletAddress.trim()) return toast.error("Outlet address is required.");
    if (gpsRequired && !hasGps) return toast.error("GPS capture is required. Wait for location and retry.");
    if (workflow.validationRules.requirePhotoEvidence && files.length < workflow.validationRules.minimumPhotos) {
      return toast.error(`At least ${workflow.validationRules.minimumPhotos} photo(s) are required.`);
    }
    if (hasSalesStep && resolvedOutcomeCode === "products_sold" && !hasValidSales) {
      return toast.error("Add at least one valid sale row.");
    }
    if (hasPosmDeployment && !posmDeployed) {
      return toast.error("Please select whether POSM was deployed.");
    }
    if (hasPosmDeployment && posmDeployed === "yes" && requirePosmQuantityWhenDeployed && (!posmQuantity || posmQuantity < 1)) {
      return toast.error("Enter POSM quantity when deployment is marked yes.");
    }
    if (!stableSubmissionKeyRef.current) {
      stableSubmissionKeyRef.current =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? `wf-${crypto.randomUUID()}`
          : `wf-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }
    setConfirmOpen(true);
  }

  return (
    <div className="space-y-4 pb-6">
      <section className="space-y-3 rounded-3xl border border-border/70 bg-card p-4">
        <h3 className="text-base font-medium">Outlet Information</h3>
        {nearbyOutlets.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {nearbyOutlets.slice(0, 8).map((outlet) => (
              <span key={outlet.id} className="rounded-full border border-border/70 bg-background px-3 py-1 text-xs">
                {outlet.name} · {Math.round(outlet.distanceMeters)}m
              </span>
            ))}
          </div>
        ) : null}

        <div className="flex flex-col gap-3">
          <Input placeholder="Customer name" value={customerName} onChange={(event) => setCustomerName(event.target.value)} />
          <Input
            type="tel"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={15}
            placeholder="Customer phone"
            value={customerPhone}
            onChange={(event) => setCustomerPhone(event.target.value.replace(/\D/g, ""))}
          />
          <Input placeholder="Outlet name" value={outletName} onChange={(event) => setOutletName(event.target.value)} />
          <Select value={areaLga} onValueChange={setAreaLga}>
            <SelectTrigger><SelectValue placeholder="Select LGA" /></SelectTrigger>
            <SelectContent>
              {lgaOptions.map((lga) => (
                <SelectItem key={lga} value={lga}>{lga}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea className="col-span-2" placeholder="Outlet address" value={outletAddress} onChange={(event) => setOutletAddress(event.target.value)} />
        </div>
      </section>

      {(hasAvailability || hasPriceSurvey || hasProductSurvey) ? (
        <section className="space-y-3 rounded-3xl border border-border/70 bg-card p-4">
          <h3 className="text-base font-medium">Product Audit</h3>
          <div className="space-y-2">
            {productAudit.map((row, index) => (
              <div key={`${row.productName}-${index}`} className="rounded-2xl border border-border p-3">
                <p className="text-sm font-medium">{row.productName}</p>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {hasAvailability ? (
                    <Select
                      value={row.available ?? ""}
                      onValueChange={(next: "yes" | "no") => setProductAudit((prev) => prev.map((item, i) => i === index ? { ...item, available: next } : item))}
                    >
                      <SelectTrigger><SelectValue placeholder="Availability" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes">Available</SelectItem>
                        <SelectItem value="no">Not available</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : null}

                  {hasProductSurvey ? (
                    <Input
                      type="number"
                      min={0}
                      placeholder="Quantity"
                      value={row.quantity ?? ""}
                      onChange={(event) => setProductAudit((prev) => prev.map((item, i) => i === index ? { ...item, quantity: event.target.value ? Number(event.target.value) : undefined } : item))}
                    />
                  ) : null}

                  {hasPriceSurvey ? (
                    <Input
                      type="number"
                      min={0}
                      placeholder="Buying price"
                      value={row.buyingPrice ?? ""}
                      onChange={(event) => setProductAudit((prev) => prev.map((item, i) => i === index ? { ...item, buyingPrice: event.target.value ? Number(event.target.value) : undefined } : item))}
                    />
                  ) : null}

                  {hasPriceSurvey ? (
                    <Input
                      type="number"
                      min={0}
                      placeholder="Selling price"
                      value={row.sellingPrice ?? ""}
                      onChange={(event) => setProductAudit((prev) => prev.map((item, i) => i === index ? { ...item, sellingPrice: event.target.value ? Number(event.target.value) : undefined } : item))}
                    />
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {hasSalesStep && isSoldOutcome ? (
        <section className="space-y-3 rounded-3xl border border-border/70 bg-card p-4">
          <h3 className="text-base font-medium">Sales Capture</h3>
          <div className="space-y-2">
            {sales.map((row, index) => (
              <div key={`${index}-${row.productName}`} className="grid gap-2 md:grid-cols-3">
                <Select
                  value={row.productName}
                  onValueChange={(next) => setSales((prev) => prev.map((item, i) => i === index ? { ...item, productName: next } : item))}
                >
                  <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                  <SelectContent>
                    {productOptions.map((item, pIndex) => {
                      const value = item.name ?? item.sku ?? `Product ${pIndex + 1}`;
                      return <SelectItem key={`${value}-${pIndex}`} value={value}>{value}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min={1}
                  placeholder="Quantity"
                  value={row.quantity}
                  onChange={(event) => setSales((prev) => prev.map((item, i) => i === index ? { ...item, quantity: Number(event.target.value || 0) } : item))}
                />
                <Input
                  type="number"
                  min={0}
                  placeholder="Price (optional)"
                  value={row.price ?? ""}
                  onChange={(event) => setSales((prev) => prev.map((item, i) => i === index ? { ...item, price: event.target.value ? Number(event.target.value) : undefined } : item))}
                />
              </div>
            ))}
            {productOptions.length > 1 && (
              <Button type="button" variant="outline" className="rounded-full" onClick={() => setSales((prev) => [...prev, { productName: productOptions[0]?.name ?? "", quantity: 1 }])}>
                Add Another Product
              </Button>
            )}
          </div>
        </section>
      ) : null}

      <section className="space-y-2 rounded-3xl border border-border/70 bg-card p-4">
        <h3 className="text-base font-medium">Photo Evidence</h3>
        <Input
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
        />
      </section>

      <section className="space-y-2 rounded-3xl border border-border/70 bg-card p-4">
        <h3 className="text-base font-medium">Visit Outcome (Optional)</h3>
        <Select value={outcomeCode} onValueChange={setOutcomeCode}>
          <SelectTrigger><SelectValue placeholder="Auto-detect from captured data" /></SelectTrigger>
          <SelectContent>
            {workflow.agentCopy.outcomes.map((item) => (
              <SelectItem key={item.code} value={item.code}>{item.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      <section className="space-y-2 rounded-3xl border border-border/70 bg-card p-4">
        <h3 className="text-base font-medium">Notes</h3>
        <Textarea placeholder="Notes (optional)" value={notes} onChange={(event) => setNotes(event.target.value)} />
      </section>

      {hasPosmDeployment ? (
        <section className="space-y-3 rounded-3xl border border-border/70 bg-card p-4">
          <h3 className="text-base font-medium">POSM Deployment</h3>
          <p className="text-sm text-muted-foreground">Did you deploy POSM?</p>
          <div className="grid grid-cols-2 gap-3">
            <Button
              type="button"
              variant={posmDeployed === "yes" ? "default" : "outline"}
              className="h-11 rounded-2xl"
              onClick={() => setPosmDeployed("yes")}
            >
              Yes
            </Button>
            <Button
              type="button"
              variant={posmDeployed === "no" ? "default" : "outline"}
              className="h-11 rounded-2xl"
              onClick={() => {
                setPosmDeployed("no");
                setPosmQuantity(undefined);
              }}
            >
              No
            </Button>
          </div>
          {posmDeployed === "yes" ? (
            <Input
              type="number"
              min={1}
              placeholder="How many POSM units deployed?"
              value={posmQuantity ?? ""}
              onChange={(event) => setPosmQuantity(event.target.value ? Number(event.target.value) : undefined)}
            />
          ) : null}
        </section>
      ) : null}

      <Button type="button" className="h-12 w-full rounded-2xl" onClick={submit} disabled={submitting}>
        {submitting ? "Submitting..." : workflow.agentCopy.submitVisitLabel}
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit Visit?</AlertDialogTitle>
            <AlertDialogDescription>
              This will save this activity for sync and reporting.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={submitNow} disabled={submitting}>
              {submitting ? "Submitting..." : "Confirm Submit"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
