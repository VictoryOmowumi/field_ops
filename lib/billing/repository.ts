import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  ActivationStatus,
  BillingAccountRow,
  BillingAccountStatus,
  CampaignActivationHistoryRow,
  CampaignActivationRow,
  CampaignInvoiceLineItemRow,
  CampaignInvoiceRow,
  ImplementationFeeStatus,
  InfrastructureAllocationRow,
} from "@/lib/billing/types";

// Typed CRUD over the commercial-licensing tables. No business logic lives here — see
// eligibility.ts / activation-service.ts / invoice-service.ts / allocation-service.ts for that.
// Every function creates its own client, matching the rest of the codebase's convention
// (lib/auth/org-access.ts, lib/platform/server.ts) rather than accepting one as a parameter.

const BILLING_ACCOUNT_COLUMNS =
  "id, organization_id, account_status, implementation_fee_status, billing_contact_name, billing_contact_email, default_currency, gating_override, payment_provider, retention_days, created_at, updated_at";

export async function getBillingAccountByOrganizationId(organizationId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("billing_accounts")
    .select(BILLING_ACCOUNT_COLUMNS)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as BillingAccountRow | null) ?? null;
}

export async function getBillingAccountById(billingAccountId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("billing_accounts")
    .select(BILLING_ACCOUNT_COLUMNS)
    .eq("id", billingAccountId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as BillingAccountRow | null) ?? null;
}

export async function listBillingAccountsWithOrganization() {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("billing_accounts")
    .select(`${BILLING_ACCOUNT_COLUMNS}, organizations ( id, name, slug, status )`)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createBillingAccount(input: {
  organizationId: string;
  accountStatus?: BillingAccountStatus;
  implementationFeeStatus?: ImplementationFeeStatus;
  billingContactEmail?: string | null;
}) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("billing_accounts")
    .insert({
      organization_id: input.organizationId,
      account_status: input.accountStatus ?? "in_good_standing",
      implementation_fee_status: input.implementationFeeStatus ?? "pending",
      billing_contact_email: input.billingContactEmail ?? null,
    })
    .select(BILLING_ACCOUNT_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return data as BillingAccountRow;
}

export async function updateBillingAccount(
  billingAccountId: string,
  patch: Partial<{
    accountStatus: BillingAccountStatus;
    implementationFeeStatus: ImplementationFeeStatus;
    billingContactName: string | null;
    billingContactEmail: string | null;
    gatingOverride: boolean | null;
    paymentProvider: BillingAccountRow["payment_provider"];
    retentionDays: number | null;
  }>
) {
  const supabase = createServerSupabaseClient();
  const update: Record<string, unknown> = {};
  if (patch.accountStatus !== undefined) update.account_status = patch.accountStatus;
  if (patch.implementationFeeStatus !== undefined) update.implementation_fee_status = patch.implementationFeeStatus;
  if (patch.billingContactName !== undefined) update.billing_contact_name = patch.billingContactName;
  if (patch.billingContactEmail !== undefined) update.billing_contact_email = patch.billingContactEmail;
  if (patch.gatingOverride !== undefined) update.gating_override = patch.gatingOverride;
  if (patch.paymentProvider !== undefined) update.payment_provider = patch.paymentProvider;
  if (patch.retentionDays !== undefined) update.retention_days = patch.retentionDays;

  const { data, error } = await supabase
    .from("billing_accounts")
    .update(update)
    .eq("id", billingAccountId)
    .select(BILLING_ACCOUNT_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return data as BillingAccountRow;
}

const CAMPAIGN_ACTIVATION_COLUMNS =
  "id, campaign_id, billing_account_id, activation_status, infra_allocation_tier, created_at, updated_at";

export async function getCampaignActivationByCampaignId(campaignId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("campaign_activations")
    .select(CAMPAIGN_ACTIVATION_COLUMNS)
    .eq("campaign_id", campaignId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as CampaignActivationRow | null) ?? null;
}

export async function getCampaignActivationById(id: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("campaign_activations")
    .select(`${CAMPAIGN_ACTIVATION_COLUMNS}, campaigns ( id, name, organization_id, status )`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

export async function listCampaignActivations(filter?: { status?: ActivationStatus }) {
  const supabase = createServerSupabaseClient();
  let query = supabase
    .from("campaign_activations")
    .select(`${CAMPAIGN_ACTIVATION_COLUMNS}, campaigns ( id, name, organization_id, status ), billing_accounts ( id, organization_id )`)
    .order("created_at", { ascending: false });
  if (filter?.status) query = query.eq("activation_status", filter.status);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listCampaignActivationsForOrganization(organizationId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("campaign_activations")
    .select(`${CAMPAIGN_ACTIVATION_COLUMNS}, campaigns!inner ( id, name, organization_id, status, completed_at, archived_at )`)
    .eq("campaigns.organization_id", organizationId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createCampaignActivation(input: {
  campaignId: string;
  billingAccountId: string;
  activationStatus?: ActivationStatus;
}) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("campaign_activations")
    .insert({
      campaign_id: input.campaignId,
      billing_account_id: input.billingAccountId,
      activation_status: input.activationStatus ?? "pending_approval",
    })
    .select(CAMPAIGN_ACTIVATION_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return data as CampaignActivationRow;
}

export async function updateCampaignActivationStatus(id: string, activationStatus: ActivationStatus) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("campaign_activations")
    .update({ activation_status: activationStatus })
    .eq("id", id)
    .select(CAMPAIGN_ACTIVATION_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return data as CampaignActivationRow;
}

export async function insertCampaignActivationHistory(input: {
  campaignActivationId: string;
  fromStatus: string | null;
  toStatus: string;
  actorUserId?: string | null;
  reason?: string | null;
}) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("campaign_activation_history")
    .insert({
      campaign_activation_id: input.campaignActivationId,
      from_status: input.fromStatus,
      to_status: input.toStatus,
      actor_user_id: input.actorUserId ?? null,
      reason: input.reason ?? null,
    })
    .select("id, campaign_activation_id, from_status, to_status, actor_user_id, reason, created_at")
    .single();
  if (error) throw new Error(error.message);
  return data as CampaignActivationHistoryRow;
}

export async function listCampaignActivationHistory(campaignActivationId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("campaign_activation_history")
    .select("id, campaign_activation_id, from_status, to_status, actor_user_id, reason, created_at")
    .eq("campaign_activation_id", campaignActivationId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as CampaignActivationHistoryRow[]) ?? [];
}

const CAMPAIGN_INVOICE_COLUMNS =
  "id, billing_account_id, campaign_activation_id, invoice_category, invoice_subtype, amount, currency, status, due_date, paid_at, payment_provider_connection_id, external_reference, notes, created_by, created_at, updated_at";

export async function listCampaignInvoicesByBillingAccount(billingAccountId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("campaign_invoices")
    .select(CAMPAIGN_INVOICE_COLUMNS)
    .eq("billing_account_id", billingAccountId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as CampaignInvoiceRow[]) ?? [];
}

export async function getCampaignInvoiceById(id: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("campaign_invoices")
    .select(CAMPAIGN_INVOICE_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as CampaignInvoiceRow | null) ?? null;
}

export async function createCampaignInvoice(input: {
  billingAccountId: string;
  campaignActivationId?: string | null;
  invoiceCategory: CampaignInvoiceRow["invoice_category"];
  invoiceSubtype: string;
  currency?: string;
  dueDate?: string | null;
  notes?: string | null;
  createdBy?: string | null;
  lineItems: Array<{ description: string; quantity?: number; unitAmount: number }>;
}) {
  const supabase = createServerSupabaseClient();

  // amount starts at the schema default (0) and is intentionally not computed here — the
  // trg_campaign_invoice_line_items_recalculate trigger (see the Phase 1 migration) is the single
  // source of truth for the total, recomputed from the line items below. This avoids the invoice
  // total ever drifting from its line items, in JS or in the database.
  const { data: invoice, error } = await supabase
    .from("campaign_invoices")
    .insert({
      billing_account_id: input.billingAccountId,
      campaign_activation_id: input.campaignActivationId ?? null,
      invoice_category: input.invoiceCategory,
      invoice_subtype: input.invoiceSubtype,
      currency: input.currency ?? "NGN",
      due_date: input.dueDate ?? null,
      notes: input.notes ?? null,
      created_by: input.createdBy ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const lineItemRows = input.lineItems.map((item) => ({
    campaign_invoice_id: invoice.id,
    description: item.description,
    quantity: item.quantity ?? 1,
    unit_amount: item.unitAmount,
  }));
  const { error: lineItemError } = await supabase.from("campaign_invoice_line_items").insert(lineItemRows);
  if (lineItemError) throw new Error(lineItemError.message);

  const created = await getCampaignInvoiceById(invoice.id);
  if (!created) throw new Error("Invoice was created but could not be re-fetched.");
  return created;
}

export async function listCampaignInvoiceLineItems(campaignInvoiceId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("campaign_invoice_line_items")
    .select("id, campaign_invoice_id, description, quantity, unit_amount, created_at")
    .eq("campaign_invoice_id", campaignInvoiceId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as CampaignInvoiceLineItemRow[]) ?? [];
}

export async function updateCampaignInvoice(
  id: string,
  patch: Partial<{
    status: CampaignInvoiceRow["status"];
    paidAt: string | null;
    paymentProviderConnectionId: string | null;
    externalReference: string | null;
    invoiceCategory: CampaignInvoiceRow["invoice_category"];
    invoiceSubtype: string;
    dueDate: string | null;
    notes: string | null;
  }>
) {
  const supabase = createServerSupabaseClient();
  const update: Record<string, unknown> = {};
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.paidAt !== undefined) update.paid_at = patch.paidAt;
  if (patch.paymentProviderConnectionId !== undefined) update.payment_provider_connection_id = patch.paymentProviderConnectionId;
  if (patch.externalReference !== undefined) update.external_reference = patch.externalReference;
  if (patch.invoiceCategory !== undefined) update.invoice_category = patch.invoiceCategory;
  if (patch.invoiceSubtype !== undefined) update.invoice_subtype = patch.invoiceSubtype;
  if (patch.dueDate !== undefined) update.due_date = patch.dueDate;
  if (patch.notes !== undefined) update.notes = patch.notes;

  const { data, error } = await supabase
    .from("campaign_invoices")
    .update(update)
    .eq("id", id)
    .select(CAMPAIGN_INVOICE_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return data as CampaignInvoiceRow;
}

// Used only by invoice-service.updateDraftInvoice — replaces the full line-item set rather than
// diffing individual rows, which is simpler and safe here because it's only ever allowed while
// the invoice is still a draft (nothing downstream depends on line-item IDs being stable yet).
// The recalculate trigger fires on both the delete and the insert, so the invoice's amount ends
// up correct either way.
export async function replaceCampaignInvoiceLineItems(
  campaignInvoiceId: string,
  lineItems: Array<{ description: string; quantity?: number; unitAmount: number }>
) {
  const supabase = createServerSupabaseClient();
  const { error: deleteError } = await supabase
    .from("campaign_invoice_line_items")
    .delete()
    .eq("campaign_invoice_id", campaignInvoiceId);
  if (deleteError) throw new Error(deleteError.message);

  const rows = lineItems.map((item) => ({
    campaign_invoice_id: campaignInvoiceId,
    description: item.description,
    quantity: item.quantity ?? 1,
    unit_amount: item.unitAmount,
  }));
  const { error: insertError } = await supabase.from("campaign_invoice_line_items").insert(rows);
  if (insertError) throw new Error(insertError.message);
}

const INFRASTRUCTURE_ALLOCATION_COLUMNS =
  "id, organization_id, campaign_activation_id, allocation_type, starts_at, ends_at, status, cost_amount, created_at";

export async function listInfrastructureAllocationsByOrganization(organizationId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("infrastructure_allocations")
    .select(INFRASTRUCTURE_ALLOCATION_COLUMNS)
    .eq("organization_id", organizationId)
    .order("starts_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as InfrastructureAllocationRow[]) ?? [];
}

export async function createInfrastructureAllocation(input: {
  organizationId: string;
  campaignActivationId?: string | null;
  allocationType: InfrastructureAllocationRow["allocation_type"];
  endsAt?: string | null;
  costAmount?: number | null;
}) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("infrastructure_allocations")
    .insert({
      organization_id: input.organizationId,
      campaign_activation_id: input.campaignActivationId ?? null,
      allocation_type: input.allocationType,
      ends_at: input.endsAt ?? null,
      cost_amount: input.costAmount ?? null,
    })
    .select(INFRASTRUCTURE_ALLOCATION_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return data as InfrastructureAllocationRow;
}

// Same aggregation already used by app/api/platform/organizations/[id]/route.ts — shared here so
// both the super-admin billing console and the org-facing billing portal show the same number.
export async function getEvidenceStorageBytesForOrganization(organizationId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("visit_evidence")
    .select("file_size")
    .eq("organization_id", organizationId)
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((sum, row) => sum + (Number(row.file_size ?? 0) || 0), 0);
}

export async function closeInfrastructureAllocation(id: string, status: "expired" | "migrated" = "expired") {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("infrastructure_allocations")
    .update({ status, ends_at: new Date().toISOString() })
    .eq("id", id)
    .select(INFRASTRUCTURE_ALLOCATION_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return data as InfrastructureAllocationRow;
}
