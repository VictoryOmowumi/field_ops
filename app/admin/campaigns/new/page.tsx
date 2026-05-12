"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import ProductCatalogSelector from "@/components/admin/ProductCatalogSelector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
} from "@/components/ui/combobox";
import { defaultOutletTypeOptions } from "@/data/outlet-types";
import { buildWorkflowConfigFromTemplate } from "@/lib/workflow";
import { supabaseClient } from "@/lib/supabase/client";
import { nigeriaLocations } from "@/data/nigeria-locations";
import type { CampaignWorkflowTemplate } from "@/types/workflow";

const DRAFT_KEY = "activationiq:admin:new-campaign:draft:v2";
const campaignTypes = ["Retail Activation", "Market Storm", "Sampling Campaign", "Merchandising Audit", "Outlet Survey"];
const workflowTemplateOptions: Array<{ label: string; value: CampaignWorkflowTemplate }> = [
  { label: "Outlet Registration", value: "outlet_registration" },
  { label: "Sales Activation", value: "sales_activation" },
  { label: "Product Audit", value: "product_audit" },
  { label: "Existing Outlet Sales", value: "existing_outlet_sales" },
  { label: "Full Trade Audit", value: "full_trade_audit" },
];

type OrgUser = { id: string; name: string; role: string };

export default function NewCampaignPage() {
  const router = useRouter();
  const [users, setUsers] = useState<OrgUser[]>([]);

  const [name, setName] = useState("");
  const [campaignType, setCampaignType] = useState("");
  const [status, setStatus] = useState<"draft" | "active" | "completed">("draft");
  const [stateName, setStateName] = useState("");
  const [selectedSupervisorIds, setSelectedSupervisorIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [targetOutlets, setTargetOutlets] = useState("");
  const [targetConversions, setTargetConversions] = useState("");
  const [expectedReps, setExpectedReps] = useState("");
  const [outletTypes, setOutletTypes] = useState<string[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [workflowTemplate, setWorkflowTemplate] = useState<CampaignWorkflowTemplate>("sales_activation");
  const [priceMode, setPriceMode] = useState<"buying" | "selling" | "both">("both");
  const [availabilityQuestionsCsv, setAvailabilityQuestionsCsv] = useState("");
  const [formRequirements, setFormRequirements] = useState({
    requireOutletPhone: true,
    requireGps: true,
    requirePhotoEvidence: true,
    requireProductQuantity: true,
    requireSalesValue: false,
    allowProductSelectionForAllTasks: true,
    allowNotes: true,
    allowRevisitStatus: true,
    requirePosmDeployment: false,
    requirePosmQuantityWhenDeployed: true,
  });

  const [savingDraft, setSavingDraft] = useState(false);
  const [creating, setCreating] = useState(false);
  const campaignTasks = useMemo(() => tasksForTemplate(workflowTemplate), [workflowTemplate]);

  const supervisors = useMemo(
    () => users.filter((user) => user.role === "supervisor" || user.role === "org_admin"),
    [users]
  );
  const hasProductDrivenTask = useMemo(
    () =>
      campaignTasks.includes("sell_to_outlet")
      || campaignTasks.includes("product_survey")
      || campaignTasks.includes("price_survey"),
    [campaignTasks]
  );
  const productFieldLabel = useMemo(() => {
    if (campaignTasks.includes("product_survey")) return "Products to Survey";
    if (campaignTasks.includes("price_survey")) return "Products for Price Survey";
    if (campaignTasks.includes("sell_to_outlet")) return "Products / SKUs for Sales Capture";
    return "Products / SKUs";
  }, [campaignTasks]);

  useEffect(() => {
    async function loadUsers() {
      const { data } = await supabaseClient.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const response = await fetch("/api/admin/users", { headers: { Authorization: `Bearer ${token}` } });
      const result = (await response.json()) as {
        success: boolean;
        users?: Array<{ id: string; name: string; role: string }>;
      };
      if (response.ok && result.success) setUsers(result.users ?? []);
    }

    void loadUsers();
  }, []);

  async function saveDraft() {
    setSavingDraft(true);
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        name,
        campaignType,
        status,
        stateName,
        selectedSupervisorIds,
        startDate,
        endDate,
        targetOutlets,
        targetConversions,
        expectedReps,
        outletTypes,
        selectedProducts,
        description,
        formRequirements,
        workflowTemplate,
        priceMode,
        availabilityQuestionsCsv,
      })
    );
    setSavingDraft(false);
    toast.success("Campaign draft saved locally.");
  }

  async function createCampaign() {
    if (!name.trim()) {
      toast.error("Campaign name is required.");
      return;
    }
    const parsedProducts = mapSelectedProductsToPayload(selectedProducts);
    if (hasProductDrivenTask && parsedProducts.length === 0) {
      toast.error("Add at least one product for the selected task(s).");
      return;
    }

    setCreating(true);
    const { data } = await supabaseClient.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setCreating(false);
      toast.error("Session expired. Please sign in again.");
      router.replace("/login");
      return;
    }

    const workflowBase = buildWorkflowConfigFromTemplate(workflowTemplate, {
      validationRules: {
        requireGpsBeforeSubmit: formRequirements.requireGps,
        requirePhotoEvidence: formRequirements.requirePhotoEvidence,
        minimumPhotos: 1,
        maximumPhotos: 4,
      },
      agentCopy: {
        startVisitLabel: "Start Visit",
        continueLabel: "Continue",
        submitVisitLabel: "Submit Visit",
        outcomeQuestion: "What happened at this outlet?",
        outcomes: [
          { code: "products_sold", label: "Products sold" },
          { code: "customer_refused", label: "Customer refused to buy" },
          { code: "follow_up_needed", label: "Follow-up needed" },
          { code: "outlet_closed", label: "Outlet closed" },
          { code: "not_interested", label: "Not interested" },
        ],
      },
    });
    const workflow = withPosmActivity(workflowBase, {
      enabled: formRequirements.requirePosmDeployment,
      requireQuantity: formRequirements.requirePosmQuantityWhenDeployed,
    });

    const response = await fetch("/api/admin/campaigns", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name,
        campaignType: campaignType || undefined,
        status,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        state: stateName || undefined,
        lga: undefined,
        targetOutlets: targetOutlets ? Number(targetOutlets) : undefined,
        targetConversions: targetConversions ? Number(targetConversions) : undefined,
        expectedReps: expectedReps ? Number(expectedReps) : undefined,
        outletTypes,
        products: hasProductDrivenTask ? parsedProducts : [],
        assignedSupervisorUserIds: selectedSupervisorIds,
        formRequirements,
        campaignTasks,
        campaignWorkflowTemplate: workflowTemplate,
        campaignWorkflow: workflow,
        runtimeFormConfig: {
          global: {
            requireGpsBeforeSubmit: true,
            requireLga: true,
            nearbyOutletRadiusMeters: 250,
          },
          tasks: {
            register_outlet: {
              requireOutletName: true,
              requireOutletType: true,
              requireContactPerson: false,
              requirePhone: formRequirements.requireOutletPhone,
              requireAddress: true,
            },
            product_survey: {
              requireProductSelection: true,
              requireProductQuantity: formRequirements.requireProductQuantity,
            },
            sell_to_outlet: {
              requireProduct: true,
              requireQuantity: formRequirements.requireProductQuantity,
              requirePrice: formRequirements.requireSalesValue,
            },
            availability_survey: {
              allowProductSelection: formRequirements.allowProductSelectionForAllTasks,
              questions: availabilityQuestionsCsv.split(",").map((q) => q.trim()).filter(Boolean),
            },
            price_survey: {
              priceMode,
              productsSource: "campaign_products",
              requireCustomerName: true,
              requireCustomerPhone: false,
            },
            product_access: {
              allowOnAllTasks: formRequirements.allowProductSelectionForAllTasks,
            },
            posm_deployment: {
              enabled: formRequirements.requirePosmDeployment,
              requireQuantityWhenDeployed: formRequirements.requirePosmQuantityWhenDeployed,
            },
          },
        },
        description: description || undefined,
      }),
    });

    const result = (await response.json()) as {
      success: boolean;
      message?: string;
      campaign?: { id: string };
    };

    setCreating(false);

    if (!response.ok || !result.success) {
      toast.error(result.message ?? "Failed to create campaign.");
      return;
    }

    localStorage.removeItem(DRAFT_KEY);
    toast.success("Campaign created successfully.");
    router.push(`/admin/campaigns/${result.campaign?.id ?? ""}`);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Create Campaign</h1>
          <p className="mt-1 text-sm text-muted-foreground">Set up campaign details, location, targets, and ownership.</p>
        </div>
        <Button variant="outline" className="rounded-full" asChild>
          <Link href="/admin/campaigns">Cancel</Link>
        </Button>
      </div>

      <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
        <section className="rounded-4xl bg-card p-6 shadow-sm ring-1 ring-border/60">
          <h2 className="font-medium">Campaign Details</h2>
          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <Field label="Campaign name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Campaign type">
              <Select value={campaignType} onValueChange={setCampaignType}>
                <SelectTrigger><SelectValue placeholder="Select campaign type" /></SelectTrigger>
                <SelectContent>{campaignTypes.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={status} onValueChange={(value: "draft" | "active" | "completed") => setStatus(value)}>
                <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Assigned supervisors">
              <div className="rounded-2xl border border-border/70 p-3">
                {supervisors.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No supervisors found.</p>
                ) : (
                  <div className="space-y-2">
                    {supervisors.map((supervisor) => (
                      <label key={supervisor.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selectedSupervisorIds.includes(supervisor.id)}
                          onChange={() =>
                            setSelectedSupervisorIds((prev) =>
                              prev.includes(supervisor.id)
                                ? prev.filter((id) => id !== supervisor.id)
                                : [...prev, supervisor.id]
                            )
                          }
                        />
                        <span>{supervisor.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </Field>
          </div>
        </section>

        <section className="rounded-4xl bg-card p-6 shadow-sm ring-1 ring-border/60">
          <h2 className="font-medium">Location</h2>
          <div className="mt-6 grid gap-5 md:grid-cols-1">
            <Field label="State">
              <Select value={stateName} onValueChange={setStateName}>
                <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                <SelectContent>{nigeriaLocations.map((item) => <SelectItem key={item.state} value={item.state}>{item.state}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
        </section>

        <section className="rounded-4xl bg-card p-6 shadow-sm ring-1 ring-border/60">
          <h2 className="font-medium">Timeline & Targets</h2>
          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <Field label="Start date"><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
            <Field label="End date"><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></Field>
            <Field label="Target outlets"><Input type="number" value={targetOutlets} onChange={(e) => setTargetOutlets(e.target.value)} /></Field>
            <Field label="Target conversions"><Input type="number" value={targetConversions} onChange={(e) => setTargetConversions(e.target.value)} /></Field>
            <Field label="Expected reps"><Input type="number" value={expectedReps} onChange={(e) => setExpectedReps(e.target.value)} /></Field>
          </div>
        </section>

        <section className="rounded-4xl bg-card p-6 shadow-sm ring-1 ring-border/60">
          <h2 className="font-medium">Products & Form Configuration</h2>
         
         <div className="mt-6 grid gap-5 md:grid-cols-2">
            <Field label="Workflow template">
              <Select value={workflowTemplate} onValueChange={(value: CampaignWorkflowTemplate) => setWorkflowTemplate(value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {workflowTemplateOptions.map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="space-y-2 md:col-span-2 rounded-2xl border border-border/70 bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground">Included activities</p>
              <p className="text-sm">{campaignTasks.join(", ").replaceAll("_", " ")}</p>
            </div>
            <ToggleField label="Require outlet phone" value={formRequirements.requireOutletPhone} onChange={(checked) => setFormRequirements((prev) => ({ ...prev, requireOutletPhone: checked }))} />
            <ToggleField label="Require GPS capture" value={formRequirements.requireGps} onChange={(checked) => setFormRequirements((prev) => ({ ...prev, requireGps: checked }))} />
            <ToggleField label="Require photo evidence" value={formRequirements.requirePhotoEvidence} onChange={(checked) => setFormRequirements((prev) => ({ ...prev, requirePhotoEvidence: checked }))} />
            <ToggleField label="Require product quantity" value={formRequirements.requireProductQuantity} onChange={(checked) => setFormRequirements((prev) => ({ ...prev, requireProductQuantity: checked }))} />
            <ToggleField label="Require sales value" value={formRequirements.requireSalesValue} onChange={(checked) => setFormRequirements((prev) => ({ ...prev, requireSalesValue: checked }))} />
            <ToggleField label="Allow products on all tasks" value={formRequirements.allowProductSelectionForAllTasks} onChange={(checked) => setFormRequirements((prev) => ({ ...prev, allowProductSelectionForAllTasks: checked }))} />
            <ToggleField label="Allow notes" value={formRequirements.allowNotes} onChange={(checked) => setFormRequirements((prev) => ({ ...prev, allowNotes: checked }))} />
            <ToggleField label="Allow revisit status" value={formRequirements.allowRevisitStatus} onChange={(checked) => setFormRequirements((prev) => ({ ...prev, allowRevisitStatus: checked }))} />
            <ToggleField label="Capture POSM deployment" value={formRequirements.requirePosmDeployment} onChange={(checked) => setFormRequirements((prev) => ({ ...prev, requirePosmDeployment: checked }))} />
            <ToggleField label="Require POSM quantity (when yes)" value={formRequirements.requirePosmQuantityWhenDeployed} onChange={(checked) => setFormRequirements((prev) => ({ ...prev, requirePosmQuantityWhenDeployed: checked }))} />
            {campaignTasks.includes("price_survey") ? (
              <Field label="Price Survey Mode">
                <Select value={priceMode} onValueChange={(value: "buying" | "selling" | "both") => setPriceMode(value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="buying">Buying</SelectItem>
                    <SelectItem value="selling">Selling</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
            {campaignTasks.includes("availability_survey") ? (
              <Field label="Availability Questions (comma-separated)">
                <Textarea className="min-h-20" value={availabilityQuestionsCsv} onChange={(e) => setAvailabilityQuestionsCsv(e.target.value)} />
              </Field>
            ) : null}
          </div>
          <div className="mt-6 grid gap-5 md:grid-cols-2">
            {hasProductDrivenTask ? (
              <Field label={productFieldLabel}>
                <ProductCatalogSelector value={selectedProducts} onChange={setSelectedProducts} />
              </Field>
            ) : (
              <div className="rounded-2xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                Products are not required for the selected task(s).
              </div>
            )}
            <div className="space-y-2">
              <p className="text-sm font-medium">Outlet types allowed</p>
              <Combobox
                items={defaultOutletTypeOptions}
                multiple
                value={outletTypes}
                onValueChange={setOutletTypes}
              >
                <ComboboxChips>
                  <ComboboxValue>
                    {outletTypes.map((item) => <ComboboxChip key={item}>{item}</ComboboxChip>)}
                  </ComboboxValue>
                  <ComboboxChipsInput placeholder="Select outlet types..." />
                </ComboboxChips>
                <ComboboxContent>
                  <ComboboxList>
                    {(item) => (
                      <ComboboxItem key={item} value={item}>
                        {item}
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </div>
          </div>
          
        </section>

        <section className="rounded-4xl bg-card p-6 shadow-sm ring-1 ring-border/60">
          <Field label="Description">
            <Textarea className="min-h-32" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </section>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" className="rounded-full" disabled={savingDraft || creating} onClick={saveDraft}>
            {savingDraft ? "Saving Draft..." : "Save as Draft"}
          </Button>
          <Button type="button" className="rounded-full px-6" disabled={creating || savingDraft} onClick={createCampaign}>
            {creating ? "Creating Campaign..." : "Create Campaign"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-2 block">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

function ToggleField({ label, value, onChange }: { label: string; value: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-muted/35 px-4 py-3">
      <span className="text-sm">{label}</span>
      <Button type="button" size="sm" variant={value ? "default" : "outline"} className="rounded-full" onClick={() => onChange(!value)}>
        {value ? "Required" : "Optional"}
      </Button>
    </div>
  );
}

function mapSelectedProductsToPayload(products: string[]) {
  return products.map((nameItem, index) => ({
    sku: `SKU-${index + 1}`,
    name: nameItem,
  }));
}

function tasksForTemplate(template: CampaignWorkflowTemplate): string[] {
  switch (template) {
    case "outlet_registration":
      return ["register_outlet"];
    case "sales_activation":
      return ["register_outlet", "sell_to_outlet"];
    case "product_audit":
      return ["availability_survey", "price_survey", "product_survey"];
    case "existing_outlet_sales":
      return ["revisit_outlet", "sell_to_outlet"];
    case "full_trade_audit":
      return ["register_outlet", "availability_survey", "price_survey", "product_survey", "sell_to_outlet"];
    default:
      return ["register_outlet", "sell_to_outlet"];
  }
}

function withPosmActivity(
  workflow: ReturnType<typeof buildWorkflowConfigFromTemplate>,
  options: { enabled: boolean; requireQuantity: boolean }
) {
  const hasPosm = workflow.activities.some((item) => item.id === "posm_deployment");
  if (options.enabled && !hasPosm) {
    workflow.activities.push({
      id: "posm_deployment",
      required: true,
      settings: { requireQuantityWhenDeployed: options.requireQuantity },
    });
  }
  if (!options.enabled && hasPosm) {
    workflow.activities = workflow.activities.filter((item) => item.id !== "posm_deployment");
  }
  if (options.enabled && hasPosm) {
    workflow.activities = workflow.activities.map((item) =>
      item.id === "posm_deployment"
        ? { ...item, settings: { ...(item.settings ?? {}), requireQuantityWhenDeployed: options.requireQuantity } }
        : item
    );
  }
  return workflow;
}
