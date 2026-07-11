export type BillingAccountStatus = "in_good_standing" | "past_due" | "suspended" | "closed";
export type ImplementationFeeStatus = "pending" | "invoiced" | "paid" | "waived";
export type PaymentProvider = "manual" | "stripe" | "paystack";

export type BillingAccountRow = {
  id: string;
  organization_id: string;
  account_status: BillingAccountStatus;
  implementation_fee_status: ImplementationFeeStatus;
  billing_contact_name: string | null;
  billing_contact_email: string | null;
  default_currency: string;
  gating_override: boolean | null;
  payment_provider: PaymentProvider;
  retention_days: number | null;
  created_at: string;
  updated_at: string;
};

export type ActivationStatus = "pending_approval" | "approved" | "rejected" | "active" | "expired";

export type CampaignActivationRow = {
  id: string;
  campaign_id: string;
  billing_account_id: string;
  activation_status: ActivationStatus;
  infra_allocation_tier: string | null;
  created_at: string;
  updated_at: string;
};

export type CampaignActivationHistoryRow = {
  id: string;
  campaign_activation_id: string;
  from_status: string | null;
  to_status: string;
  actor_user_id: string | null;
  reason: string | null;
  created_at: string;
};

export type InvoiceCategory = "one_time" | "per_campaign" | "recurring" | "usage_based";
export type InvoiceSubtype =
  | "implementation"
  | "activation"
  | "infrastructure"
  | "archive_storage"
  | "reactivation"
  | "enhancement";
export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "void";

// Known subtypes today. Deliberately not a DB check constraint (see migration comment) so new
// billable line items don't require a schema migration — this list is the application-level guard.
export const INVOICE_SUBTYPES: InvoiceSubtype[] = [
  "implementation",
  "activation",
  "infrastructure",
  "archive_storage",
  "reactivation",
  "enhancement",
];

export type CampaignInvoiceRow = {
  id: string;
  billing_account_id: string;
  campaign_activation_id: string | null;
  invoice_category: InvoiceCategory;
  invoice_subtype: string;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  due_date: string | null;
  paid_at: string | null;
  payment_provider_connection_id: string | null;
  external_reference: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CampaignInvoiceLineItemRow = {
  id: string;
  campaign_invoice_id: string;
  description: string;
  quantity: number;
  unit_amount: number;
  created_at: string;
};

export type AllocationType = "compute" | "storage_hot" | "storage_retention" | "storage_archive";
export type AllocationStatus = "active" | "expired" | "migrated";

export type InfrastructureAllocationRow = {
  id: string;
  organization_id: string;
  campaign_activation_id: string | null;
  allocation_type: AllocationType;
  starts_at: string;
  ends_at: string | null;
  status: AllocationStatus;
  cost_amount: number | null;
  created_at: string;
};
