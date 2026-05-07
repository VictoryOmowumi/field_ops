"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getAnswerValue, shouldShowField, updateAnswer } from "@/lib/task-form";
import type {
  CampaignFormField,
  CampaignProduct,
  CampaignTaskForm,
  NearbyOutlet,
  VisitAnswer,
  VisitOutcome,
  VisitPhoto,
  VisitSubmission,
} from "@/types/campaign-form";

type DynamicCampaignTaskFormProps = {
  form: CampaignTaskForm;
  nearbyOutlets: NearbyOutlet[];
  onSubmit?: (submission: VisitSubmission) => Promise<void> | void;
};

type ProductAuditValue = Array<{
  productId: string;
  productName: string;
  buyingPrice?: number;
  sellingPrice?: number;
  quantity?: number;
  available?: boolean;
}>;

export default function DynamicCampaignTaskForm({
  form,
  nearbyOutlets,
  onSubmit,
}: DynamicCampaignTaskFormProps) {
  const [outletMode, setOutletMode] = useState<"existing" | "new">(
    form.settings.allowExistingOutletSelection ? "existing" : "new"
  );
  const [selectedExistingOutletId, setSelectedExistingOutletId] = useState<string>(
    nearbyOutlets[0]?.id ?? ""
  );
  const [showOutletUpdatesForExisting, setShowOutletUpdatesForExisting] = useState(false);
  const [answers, setAnswers] = useState<VisitAnswer[]>(() => {
    const seed: VisitAnswer[] = [
      {
        fieldName: "visitOutcome",
        value: form.settings.allowedOutcomes[0] ?? "registered_only",
      },
    ];

    for (const section of form.sections) {
      for (const field of section.fields) {
        const defaultValue = field.metadata?.defaultValue;
        if (defaultValue === undefined) continue;
        seed.push({ fieldName: field.name, value: defaultValue });
      }
    }
    return seed;
  });
  const [photos, setPhotos] = useState<VisitPhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const sortedSections = useMemo(
    () => [...form.sections].sort((a, b) => a.order - b.order),
    [form.sections]
  );

  const lgaValue = getAnswerValue(answers, "areaLga");
  const outcomeValue = getAnswerValue(answers, "visitOutcome");

  function setFieldValue(fieldName: string, value: unknown) {
    setAnswers((prev) => updateAnswer(prev, fieldName, value));
  }

  function isFieldRequired(field: CampaignFormField) {
    if (!field.required) return false;
    if (field.type === "outlet_information" as never) return true;
    return true;
  }

  function getProductsForField(field: CampaignFormField): CampaignProduct[] {
    const fromMetadata = field.metadata?.products;
    if (Array.isArray(fromMetadata)) {
      return fromMetadata as CampaignProduct[];
    }
    return form.products ?? [];
  }

  function getProductAuditValue(fieldName: string): ProductAuditValue {
    const value = getAnswerValue(answers, fieldName);
    if (!Array.isArray(value)) return [];
    return value as ProductAuditValue;
  }

  function updateProductAuditValue(fieldName: string, nextValue: ProductAuditValue) {
    setFieldValue(fieldName, nextValue);
  }

  function toggleProductInAudit(fieldName: string, product: CampaignProduct) {
    const current = getProductAuditValue(fieldName);
    const exists = current.find((item) => item.productId === product.id);
    if (exists) {
      updateProductAuditValue(
        fieldName,
        current.filter((item) => item.productId !== product.id)
      );
      return;
    }
    updateProductAuditValue(fieldName, [
      ...current,
      { productId: product.id, productName: product.name },
    ]);
  }

  function updateProductAuditPrice(
    fieldName: string,
    productId: string,
    key: "buyingPrice" | "sellingPrice",
    value: string
  ) {
    const current = getProductAuditValue(fieldName);
    const numericValue = value ? Number(value) : undefined;
    const next = current.map((item) =>
      item.productId === productId ? { ...item, [key]: numericValue } : item
    );
    updateProductAuditValue(fieldName, next);
  }

  function attachPhotos(fieldName: string, files: FileList | null) {
    if (!files) return;
    const nextPhotos = Array.from(files).map((file) => ({
      id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${file.name}`,
      fieldName,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      previewUrl: URL.createObjectURL(file),
      file,
    }));
    setPhotos((prev) => [...prev, ...nextPhotos]);
  }

  function removePhoto(photoId: string) {
    setPhotos((prev) => prev.filter((photo) => photo.id !== photoId));
  }

  function validateBeforeSubmit() {
    const visibleSections = sortedSections.filter((section) => {
      if (section.type !== "outlet_information") return true;
      if (outletMode === "new") return true;
      return showOutletUpdatesForExisting;
    });

    for (const section of visibleSections) {
      for (const field of section.fields) {
        if (!shouldShowField(field, answers)) continue;
        if (!isFieldRequired(field)) continue;

        const value = getAnswerValue(answers, field.name);
        if (field.type === "photo") {
          const hasPhoto = photos.some((photo) => photo.fieldName === field.name);
          if (!hasPhoto) {
            toast.error(`${field.label} is required.`);
            return false;
          }
          continue;
        }

        if (field.type === "product_selector") {
          const productRows = Array.isArray(value) ? (value as ProductAuditValue) : [];
          if (!productRows.length) {
            toast.error(`${field.label} is required.`);
            return false;
          }
          const requireBuyingPrice = Boolean(field.metadata?.requireBuyingPrice);
          const requireSellingPrice = Boolean(field.metadata?.requireSellingPrice);
          const requireQuantity = Boolean(field.metadata?.requireQuantity);
          const missingPrice = productRows.some(
            (item) =>
              (requireBuyingPrice && (item.buyingPrice === undefined || Number.isNaN(item.buyingPrice))) ||
              (requireSellingPrice && (item.sellingPrice === undefined || Number.isNaN(item.sellingPrice))) ||
              (requireQuantity && (item.quantity === undefined || Number.isNaN(item.quantity)))
          );
          if (missingPrice) {
            toast.error(`Complete required pricing fields in ${field.label}.`);
            return false;
          }
          continue;
        }

        if (value === undefined || value === null || value === "") {
          toast.error(`${field.label} is required.`);
          return false;
        }
        if (Array.isArray(value) && value.length === 0) {
          toast.error(`${field.label} is required.`);
          return false;
        }
      }
    }

    if (form.settings.requirePhotoEvidence && photos.length < form.settings.minimumPhotos) {
      toast.error(`At least ${form.settings.minimumPhotos} photo(s) are required.`);
      return false;
    }
    if (photos.length > form.settings.maximumPhotos) {
      toast.error(`You can upload at most ${form.settings.maximumPhotos} photos.`);
      return false;
    }
    if (outletMode === "existing" && !selectedExistingOutletId) {
      toast.error("Select an existing nearby outlet or switch to new outlet.");
      return false;
    }
    return true;
  }

  async function handleSubmit() {
    if (!validateBeforeSubmit()) return;

    setSubmitting(true);
    try {
      const outcome = (getAnswerValue(answers, "visitOutcome") as VisitOutcome | undefined)
        ?? form.settings.allowedOutcomes[0]
        ?? "registered_only";

      const nowIso = new Date().toISOString();
      const submission: VisitSubmission = {
        id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `visit-${Date.now()}`,
        organizationId: form.organizationId,
        campaignId: form.campaignId,
        agentId: "agent-current-user",
        outletId: outletMode === "existing" ? selectedExistingOutletId || undefined : undefined,
        outletMode,
        outcome,
        answers,
        photos,
        syncStatus: "pending_sync",
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      if (onSubmit) {
        await onSubmit(submission);
      } else {
        // TODO: Replace with local IndexedDB queue write when offline sync layer is wired.
        console.log("VisitSubmission (mock):", submission);
      }

      toast.success("Visit saved to pending sync queue.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4 pb-6">
      <section className="rounded-4xl bg-card p-4 ring-1 ring-border/60">
        <h2 className="text-base font-medium">Nearby Outlets</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Select existing outlet or register a new outlet for this visit.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {form.settings.allowExistingOutletSelection ? (
            <Button
              type="button"
              variant={outletMode === "existing" ? "default" : "outline"}
              className="rounded-full"
              onClick={() => setOutletMode("existing")}
            >
              Use Existing Outlet
            </Button>
          ) : null}
          {form.settings.allowNewOutletRegistration ? (
            <Button
              type="button"
              variant={outletMode === "new" ? "default" : "outline"}
              className="rounded-full"
              onClick={() => setOutletMode("new")}
            >
              Register New Outlet
            </Button>
          ) : null}
        </div>

        {outletMode === "existing" ? (
          <div className="mt-4 space-y-2">
            {nearbyOutlets.map((outlet) => (
              <button
                key={outlet.id}
                type="button"
                className={`w-full rounded-3xl border p-3 text-left ${
                  selectedExistingOutletId === outlet.id
                    ? "border-primary bg-primary/10"
                    : "border-border bg-background"
                }`}
                onClick={() => setSelectedExistingOutletId(outlet.id)}
              >
                <p className="font-medium text-foreground">{outlet.name}</p>
                <p className="text-xs text-muted-foreground">{Math.round(outlet.distanceMeters)}m away</p>
              </button>
            ))}
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => setShowOutletUpdatesForExisting((prev) => !prev)}
            >
              {showOutletUpdatesForExisting ? "Hide Outlet Update Fields" : "Update Outlet Details (Optional)"}
            </Button>
          </div>
        ) : null}
      </section>

      {sortedSections.map((section) => {
        if (section.type === "outlet_information" && outletMode === "existing" && !showOutletUpdatesForExisting) {
          return null;
        }

        return (
          <section key={section.id} className="rounded-4xl bg-card p-4 ring-1 ring-border/60">
            <h3 className="text-base font-medium">{section.title}</h3>
            {section.description ? (
              <p className="mt-1 text-sm text-muted-foreground">{section.description}</p>
            ) : null}

            <div className="mt-4 space-y-4">
              {section.fields.map((field) => {
                if (!shouldShowField(field, answers)) return null;
                return (
                  <div key={field.id} className="space-y-2">
                    <p className="text-sm font-medium">
                      {field.label}
                      {field.required ? " *" : ""}
                    </p>
                    <FieldRenderer
                      field={field}
                      answers={answers}
                      photos={photos}
                      setFieldValue={setFieldValue}
                      onAttachPhotos={attachPhotos}
                      onRemovePhoto={removePhoto}
                      getProductsForField={getProductsForField}
                      getProductAuditValue={getProductAuditValue}
                      toggleProductInAudit={toggleProductInAudit}
                      updateProductAuditPrice={updateProductAuditPrice}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <section className="rounded-4xl bg-card p-4 ring-1 ring-border/60">
        <h3 className="font-medium">Review Submission</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Outlet mode: <span className="text-foreground">{outletMode}</span> · Outcome:{" "}
          <span className="text-foreground">{String(outcomeValue ?? "-")}</span> · LGA:{" "}
          <span className="text-foreground">{String(lgaValue ?? "-")}</span> · Photos:{" "}
          <span className="text-foreground">{photos.length}</span>
        </p>
      </section>

      <Button className="h-12 w-full rounded-2xl" disabled={submitting} onClick={handleSubmit}>
        {submitting ? "Saving..." : "Save Visit"}
      </Button>
    </div>
  );
}

type FieldRendererProps = {
  field: CampaignFormField;
  answers: VisitAnswer[];
  photos: VisitPhoto[];
  setFieldValue: (fieldName: string, value: unknown) => void;
  onAttachPhotos: (fieldName: string, files: FileList | null) => void;
  onRemovePhoto: (photoId: string) => void;
  getProductsForField: (field: CampaignFormField) => CampaignProduct[];
  getProductAuditValue: (fieldName: string) => ProductAuditValue;
  toggleProductInAudit: (fieldName: string, product: CampaignProduct) => void;
  updateProductAuditPrice: (
    fieldName: string,
    productId: string,
    key: "buyingPrice" | "sellingPrice",
    value: string
  ) => void;
};

function FieldRenderer({
  field,
  answers,
  photos,
  setFieldValue,
  onAttachPhotos,
  onRemovePhoto,
  getProductsForField,
  getProductAuditValue,
  toggleProductInAudit,
  updateProductAuditPrice,
}: FieldRendererProps) {
  const value = getAnswerValue(answers, field.name);

  if (field.type === "textarea") {
    return (
      <Textarea
        placeholder={field.placeholder}
        value={String(value ?? "")}
        onChange={(event) => setFieldValue(field.name, event.target.value)}
      />
    );
  }

  if (field.type === "select") {
    return (
      <Select value={String(value ?? "")} onValueChange={(next) => setFieldValue(field.name, next)}>
        <SelectTrigger>
          <SelectValue placeholder={field.placeholder ?? "Select option"} />
        </SelectTrigger>
        <SelectContent>
          {(field.options ?? []).map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (field.type === "radio") {
    return (
      <div className="grid gap-2">
        {(field.options ?? []).map((option) => (
          <Button
            key={option.value}
            type="button"
            variant={String(value ?? "") === option.value ? "default" : "outline"}
            className="h-11 justify-start rounded-2xl"
            onClick={() => setFieldValue(field.name, option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    );
  }

  if (field.type === "yes_no") {
    return (
      <div className="grid grid-cols-2 gap-3">
        <Button
          type="button"
          variant={value === "yes" ? "default" : "outline"}
          className="h-12 rounded-2xl"
          onClick={() => setFieldValue(field.name, "yes")}
        >
          Yes
        </Button>
        <Button
          type="button"
          variant={value === "no" ? "default" : "outline"}
          className="h-12 rounded-2xl"
          onClick={() => setFieldValue(field.name, "no")}
        >
          No
        </Button>
      </div>
    );
  }

  if (field.type === "checkbox") {
    return (
      <label className="flex items-center gap-2">
        <Checkbox
          checked={Boolean(value)}
          onCheckedChange={(checked) => setFieldValue(field.name, Boolean(checked))}
        />
        <span className="text-sm text-muted-foreground">Checked</span>
      </label>
    );
  }

  if (field.type === "multi_select") {
    const selectedValues = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div className="space-y-2">
        {(field.options ?? []).map((option) => {
          const checked = selectedValues.includes(option.value);
          return (
            <label key={option.value} className="flex items-center gap-2 rounded-2xl border border-border p-3">
              <Checkbox
                checked={checked}
                onCheckedChange={(nextChecked) => {
                  const boolChecked = Boolean(nextChecked);
                  const nextValues = boolChecked
                    ? [...selectedValues, option.value]
                    : selectedValues.filter((item) => item !== option.value);
                  setFieldValue(field.name, nextValues);
                }}
              />
              <span className="text-sm">{option.label}</span>
            </label>
          );
        })}
      </div>
    );
  }

  if (field.type === "product_selector") {
    const products = getProductsForField(field);
    const selectedRows = getProductAuditValue(field.name);
    const mode = String(field.metadata?.mode ?? "default");
    const requireBuyingPrice = Boolean(field.metadata?.requireBuyingPrice);
    const requireSellingPrice = Boolean(field.metadata?.requireSellingPrice);
    const requireQuantity = Boolean(field.metadata?.requireQuantity);
    const captureAvailability = Boolean(field.metadata?.captureAvailability);

    return (
      <div className="space-y-3">
        {products.map((product) => {
          const selected = selectedRows.find((row) => row.productId === product.id);
          return (
            <div key={product.id} className="rounded-2xl border border-border bg-background p-3">
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={Boolean(selected)}
                  onCheckedChange={() => toggleProductInAudit(field.name, product)}
                />
                <span className="text-sm font-medium">{product.name}</span>
              </label>

              {selected && mode === "price_audit" ? (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {requireBuyingPrice ? (
                    <Input
                      inputMode="decimal"
                      type="number"
                      min={0}
                      placeholder="Buying Price (NGN)"
                      value={selected.buyingPrice ?? ""}
                      onChange={(event) =>
                        updateProductAuditPrice(
                          field.name,
                          product.id,
                          "buyingPrice",
                          event.target.value
                        )
                      }
                    />
                  ) : null}
                  {requireSellingPrice ? (
                    <Input
                      inputMode="decimal"
                      type="number"
                      min={0}
                      placeholder="Selling Price (NGN)"
                      value={selected.sellingPrice ?? ""}
                      onChange={(event) =>
                        updateProductAuditPrice(
                          field.name,
                          product.id,
                          "sellingPrice",
                          event.target.value
                        )
                      }
                    />
                  ) : null}
                </div>
              ) : null}
              {selected && mode !== "price_audit" ? (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {captureAvailability ? (
                    <Select
                      value={selected.available === undefined ? "" : selected.available ? "yes" : "no"}
                      onValueChange={(next) => {
                        const current = getProductAuditValue(field.name);
                        const updated = current.map((item) =>
                          item.productId === product.id
                            ? { ...item, available: next === "yes" }
                            : item
                        );
                        setFieldValue(field.name, updated);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Availability" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes">Available</SelectItem>
                        <SelectItem value="no">Not Available</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : null}
                  {requireQuantity ? (
                    <Input
                      type="number"
                      min={0}
                      placeholder="Quantity"
                      value={selected.quantity ?? ""}
                      onChange={(event) => {
                        const current = getProductAuditValue(field.name);
                        const updated = current.map((item) =>
                          item.productId === product.id
                            ? {
                                ...item,
                                quantity: event.target.value ? Number(event.target.value) : undefined,
                              }
                            : item
                        );
                        setFieldValue(field.name, updated);
                      }}
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  if (field.type === "photo") {
    const fieldPhotos = photos.filter((photo) => photo.fieldName === field.name);
    return (
      <div className="space-y-2">
        <Input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(event) => onAttachPhotos(field.name, event.target.files)}
        />
        {fieldPhotos.length ? (
          <div className="space-y-2">
            {fieldPhotos.map((photo) => (
              <div key={photo.id} className="flex items-center justify-between rounded-2xl border border-border p-2 text-sm">
                <span className="truncate">{photo.fileName}</span>
                <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={() => onRemovePhoto(photo.id)}>
                  Remove
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border p-3 text-sm text-muted-foreground">
            No photo selected yet.
          </div>
        )}
      </div>
    );
  }

  if (field.type === "gps") {
    return (
      <div className="rounded-2xl border border-border bg-background p-3 text-sm text-muted-foreground">
        GPS check placeholder. TODO: wire device geolocation + permission checks.
      </div>
    );
  }

  if (field.type === "number" || field.type === "currency") {
    return (
      <Input
        type="number"
        inputMode="decimal"
        min={0}
        placeholder={field.placeholder}
        value={String(value ?? "")}
        onChange={(event) => setFieldValue(field.name, event.target.value)}
      />
    );
  }

  if (field.type === "date") {
    return (
      <Input
        type="date"
        value={String(value ?? "")}
        onChange={(event) => setFieldValue(field.name, event.target.value)}
      />
    );
  }

  return (
    <Input
      type={field.type === "phone" ? "tel" : "text"}
      placeholder={field.placeholder}
      value={String(value ?? "")}
      onChange={(event) => setFieldValue(field.name, event.target.value)}
    />
  );
}

