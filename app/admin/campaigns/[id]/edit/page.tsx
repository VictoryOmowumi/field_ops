"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
import { nigeriaLocations } from "@/data/nigeria-locations";
import { defaultOutletTypeOptions } from "@/data/outlet-types";
import { buildWorkflowConfigFromTemplate } from "@/lib/workflow";
import { supabaseClient } from "@/lib/supabase/client";
import type { CampaignWorkflowTemplate } from "@/types/workflow";

const campaignTypes = ["Retail Activation", "Market Storm", "Sampling Campaign", "Merchandising Audit", "Outlet Survey"];
const workflowTemplateOptions: Array<{ label: string; value: CampaignWorkflowTemplate }> = [
  { label: "Outlet Registration", value: "outlet_registration" },
  { label: "Sales Activation", value: "sales_activation" },
  { label: "Product Audit", value: "product_audit" },
  { label: "Existing Outlet Sales", value: "existing_outlet_sales" },
  { label: "Full Trade Audit", value: "full_trade_audit" },
];
type OrgUser = { id: string; name: string; role: string };

export default function EditCampaignPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const campaignId = params.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState<OrgUser[]>([]);

  const [name, setName] = useState("");
  const [campaignType, setCampaignType] = useState("");
  const [status, setStatus] = useState<"draft" | "active" | "completed">("draft");
  const [stateName, setStateName] = useState("");
  const [assignedSupervisorUserId, setAssignedSupervisorUserId] = useState("none");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [targetOutlets, setTargetOutlets] = useState("");
  const [targetConversions, setTargetConversions] = useState("");
  const [expectedReps, setExpectedReps] = useState("");
  const [outletTypes, setOutletTypes] = useState<string[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [formRequirements, setFormRequirements] = useState<Record<string, boolean>>({});
  const [workflowTemplate, setWorkflowTemplate] = useState<CampaignWorkflowTemplate>("sales_activation");
  const [priceMode, setPriceMode] = useState<"buying" | "selling" | "both">("both");
  const [availabilityQuestionsCsv, setAvailabilityQuestionsCsv] = useState("");

  const supervisors = useMemo(() => users.filter((u) => u.role === "supervisor" || u.role === "org_admin"), [users]);
  const campaignTasks = useMemo(() => tasksForTemplate(workflowTemplate), [workflowTemplate]);
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
    async function load() {
      const { data } = await supabaseClient.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        toast.error("Session expired. Please sign in again.");
        setLoading(false);
        return;
      }

      const [campaignRes, usersRes] = await Promise.all([
        fetch(`/api/admin/campaigns/${campaignId}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/admin/users", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const campaignResult = await campaignRes.json();
      const usersResult = await usersRes.json();
      setLoading(false);

      if (!campaignRes.ok || !campaignResult.success || !campaignResult.campaign) {
        toast.error(campaignResult.message ?? "Failed to load campaign.");
        return;
      }

      const campaign = campaignResult.campaign as Record<string, unknown>;
      setName((campaign.name as string) ?? "");
      setCampaignType((campaign.campaign_type as string) ?? "");
      setStatus(((campaign.status as "draft" | "active" | "completed") ?? "draft"));
      setStateName((campaign.state as string) ?? "");
      setAssignedSupervisorUserId((campaign.assigned_supervisor_user_id as string) ?? "none");
      setStartDate((campaign.start_date as string) ?? "");
      setEndDate((campaign.end_date as string) ?? "");
      setTargetOutlets(campaign.target_outlets ? String(campaign.target_outlets) : "");
      setTargetConversions(campaign.target_conversions ? String(campaign.target_conversions) : "");
      setExpectedReps(campaign.expected_reps ? String(campaign.expected_reps) : "");
      setOutletTypes(Array.isArray(campaign.outlet_types) ? (campaign.outlet_types as string[]) : []);
      setSelectedProducts(
        Array.isArray(campaign.products)
          ? (campaign.products as Array<{ name?: string; sku?: string }>).map((p) => p.name || p.sku || "").filter(Boolean)
          : []
      );
      setDescription((campaign.description as string) ?? "");
      setFormRequirements({
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
        ...((campaign.form_requirements as Record<string, boolean>) ?? {}),
      });
      setWorkflowTemplate((campaign.campaign_workflow_template as CampaignWorkflowTemplate | undefined) ?? "sales_activation");
      const runtime = (campaign.runtime_form_config as Record<string, unknown>) ?? {};
      const tasksObj = (runtime.tasks as Record<string, unknown>) ?? {};
      const priceTask = (tasksObj.price_survey as Record<string, unknown>) ?? {};
      const availabilityTask = (tasksObj.availability_survey as Record<string, unknown>) ?? {};
      setPriceMode((priceTask.priceMode as "buying" | "selling" | "both") ?? "both");
      setAvailabilityQuestionsCsv(Array.isArray(availabilityTask.questions) ? (availabilityTask.questions as string[]).join(", ") : "");

      if (usersRes.ok && usersResult.success) setUsers(usersResult.users ?? []);
    }
    void load();
  }, [campaignId]);

  async function save() {
    const parsedProducts = mapSelectedProductsToPayload(selectedProducts);
    if (hasProductDrivenTask && parsedProducts.length === 0) {
      toast.error("Add at least one product for the selected task(s).");
      return;
    }
    const workflowBase = buildWorkflowConfigFromTemplate(workflowTemplate, {
      validationRules: {
        requireGpsBeforeSubmit: Boolean(formRequirements.requireGps),
        requirePhotoEvidence: Boolean(formRequirements.requirePhotoEvidence),
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
      enabled: Boolean(formRequirements.requirePosmDeployment),
      requireQuantity: Boolean(formRequirements.requirePosmQuantityWhenDeployed),
    });
    setSaving(true);
    const { data } = await supabaseClient.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setSaving(false);
      toast.error("Session expired. Please sign in again.");
      return;
    }
    const response = await fetch(`/api/admin/campaigns/${campaignId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name,
        campaignType: campaignType || null,
        status,
        state: stateName || null,
        lga: null,
        assignedSupervisorUserId: assignedSupervisorUserId === "none" ? null : assignedSupervisorUserId,
        startDate: startDate || null,
        endDate: endDate || null,
        targetOutlets: targetOutlets ? Number(targetOutlets) : null,
        targetConversions: targetConversions ? Number(targetConversions) : null,
        expectedReps: expectedReps ? Number(expectedReps) : null,
        outletTypes,
        products: hasProductDrivenTask ? parsedProducts : [],
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
              requirePhone: Boolean(formRequirements.requireOutletPhone),
              requireAddress: true,
            },
            product_survey: {
              requireProductSelection: true,
              requireProductQuantity: Boolean(formRequirements.requireProductQuantity),
            },
            sell_to_outlet: {
              requireProduct: true,
              requireQuantity: Boolean(formRequirements.requireProductQuantity),
              requirePrice: Boolean(formRequirements.requireSalesValue),
            },
            availability_survey: {
              allowProductSelection: Boolean(formRequirements.allowProductSelectionForAllTasks),
              questions: availabilityQuestionsCsv.split(",").map((q) => q.trim()).filter(Boolean),
            },
            price_survey: {
              priceMode,
              productsSource: "campaign_products",
              requireCustomerName: true,
              requireCustomerPhone: false,
            },
            product_access: {
              allowOnAllTasks: Boolean(formRequirements.allowProductSelectionForAllTasks ?? true),
            },
            posm_deployment: {
              enabled: Boolean(formRequirements.requirePosmDeployment),
              requireQuantityWhenDeployed: Boolean(formRequirements.requirePosmQuantityWhenDeployed),
            },
          },
        },
        description,
      }),
    });
    const result = await response.json();
    setSaving(false);
    if (!response.ok || !result.success) {
      toast.error(result.message ?? "Failed to save campaign.");
      return;
    }
    toast.success("Campaign updated.");
    router.push(`/admin/campaigns/${campaignId}`);
  }

  if (loading) return <div className="rounded-4xl bg-card p-10 text-center ring-1 ring-border/60">Loading...</div>;

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Edit Campaign</h1>
          <p className="mt-1 text-sm text-muted-foreground">Update campaign details and configuration.</p>
        </div>
        <Button variant="outline" className="rounded-full" asChild><Link href={`/admin/campaigns/${campaignId}`}>Cancel</Link></Button>
      </div>

      <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
        <section className="rounded-4xl bg-card p-6 shadow-sm ring-1 ring-border/60">
          <div className="mt-1 grid gap-5 md:grid-cols-2">
            <Field label="Campaign name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Campaign type"><Select value={campaignType} onValueChange={setCampaignType}><SelectTrigger><SelectValue placeholder="Select campaign type" /></SelectTrigger><SelectContent>{campaignTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Status"><Select value={status} onValueChange={(v: "draft" | "active" | "completed") => setStatus(v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="draft">Draft</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="completed">Completed</SelectItem></SelectContent></Select></Field>
            <Field label="Assigned supervisor"><Select value={assignedSupervisorUserId} onValueChange={setAssignedSupervisorUserId}><SelectTrigger><SelectValue placeholder="Select supervisor" /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem>{supervisors.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select></Field>
          </div>
        </section>

        <section className="rounded-4xl bg-card p-6 shadow-sm ring-1 ring-border/60">
          <div className="grid gap-5 md:grid-cols-1">
            <Field label="State"><Select value={stateName} onValueChange={setStateName}><SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger><SelectContent>{nigeriaLocations.map((n) => <SelectItem key={n.state} value={n.state}>{n.state}</SelectItem>)}</SelectContent></Select></Field>
          </div>
        </section>

        <section className="rounded-4xl bg-card p-6 shadow-sm ring-1 ring-border/60">
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Start date"><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
            <Field label="End date"><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></Field>
            <Field label="Target outlets"><Input type="number" value={targetOutlets} onChange={(e) => setTargetOutlets(e.target.value)} /></Field>
            <Field label="Target conversions"><Input type="number" value={targetConversions} onChange={(e) => setTargetConversions(e.target.value)} /></Field>
            <Field label="Expected reps"><Input type="number" value={expectedReps} onChange={(e) => setExpectedReps(e.target.value)} /></Field>
          </div>
        </section>

        <section className="rounded-4xl bg-card p-6 shadow-sm ring-1 ring-border/60">
          {hasProductDrivenTask ? (
            <Field label={productFieldLabel}>
              <ProductCatalogSelector value={selectedProducts} onChange={setSelectedProducts} />
            </Field>
          ) : (
            <div className="rounded-2xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
              Products are not required for the selected task(s).
            </div>
          )}
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
          <div className="mt-5 space-y-2 rounded-2xl border border-border/70 bg-muted/30 p-3">
            <p className="text-xs font-medium text-muted-foreground">Included activities</p>
            <p className="text-sm">{campaignTasks.join(", ").replaceAll("_", " ")}</p>
          </div>
          <div className="mt-5 space-y-2">
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
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[ 
              ["requireOutletPhone", "Require outlet phone"],
              ["requireGps", "Require GPS capture"],
              ["requirePhotoEvidence", "Require photo evidence"],
              ["requireProductQuantity", "Require product quantity"],
              ["requireSalesValue", "Require sales value"],
              ["allowProductSelectionForAllTasks", "Allow products on all tasks"],
              ["allowNotes", "Allow notes"],
              ["allowRevisitStatus", "Allow revisit status"],
              ["requirePosmDeployment", "Capture POSM deployment"],
              ["requirePosmQuantityWhenDeployed", "Require POSM quantity (when yes)"],
            ].map(([key, label]) => (
              <ToggleField key={key} label={label} value={Boolean(formRequirements[key])} onChange={(checked) => setFormRequirements((prev) => ({ ...prev, [key]: checked }))} />
            ))}
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
        </section>

        <section className="rounded-4xl bg-card p-6 shadow-sm ring-1 ring-border/60">
          <Field label="Description"><Textarea className="min-h-24" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        </section>

        <div className="flex justify-end gap-2">
          <Button className="rounded-full px-6" disabled={saving} onClick={save}>{saving ? "Saving..." : "Save Changes"}</Button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="space-y-2 block"><span className="text-sm font-medium">{label}</span>{children}</label>;
}

function ToggleField({ label, value, onChange }: { label: string; value: boolean; onChange: (checked: boolean) => void }) {
  return <div className="flex items-center justify-between rounded-2xl bg-muted/35 px-4 py-3"><span className="text-sm">{label}</span><Button type="button" size="sm" variant={value ? "default" : "outline"} className="rounded-full" onClick={() => onChange(!value)}>{value ? "Required" : "Optional"}</Button></div>;
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
