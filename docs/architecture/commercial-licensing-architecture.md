# Commercial Licensing, Campaign Activation Billing & Storage Lifecycle

**Architecture Review · ActivationIQ**

A domain model and phased plan for gating campaign activation on commercial approval — without touching login, historical reporting, or evidence access — plus the storage tiering needed to move completed-campaign media to Cloudflare R2.

| | |
|---|---|
| **Repo** | field_ops |
| **Branch** | feat/agents-offline-functionality |
| **Reviewed** | 2026-07-06 (revised after design review) |
| **Status** | Blueprint — no code changed |

## Contents

1. [Current architecture assessment](#1-current-architecture-assessment)
2. [Problems with the existing implementation](#2-problems-with-the-existing-implementation)
3. [Proposed domain model](#3-proposed-domain-model)
4. [Database changes](#4-database-changes)
5. [Backend / API changes](#5-backend--api-changes)
6. [Frontend / UI changes](#6-frontend--ui-changes)
7. [Super Admin changes](#7-super-admin-changes)
8. [Migration strategy](#8-migration-strategy)
9. [Rollout plan](#9-rollout-plan)
10. [Risks](#10-risks)
11. [Recommended phased implementation](#11-recommended-phased-implementation)
12. [Data archival & Cloudflare R2 plan](#12-data-archival--cloudflare-r2-plan)

---

## 1. Current architecture assessment

Findings from a full pass over the organizations, campaigns, evidence, and storage layers.

The two enum fields that look purpose-built for this project — `organizations.status` (`active | suspended | trial | archived`) and `organizations.plan` (`starter | growth | enterprise`) — already exist in `supabase/migrations/20260506_platform_foundation.sql:16-17`. Neither is read anywhere to gate behavior. A repo-wide check confirms zero call sites do `if (org.status === "suspended")` or branch on `plan`; they're display-only fields surfaced in the super admin org list. There's even a stray `platform_settings` row, `default_organization_status`, that suggests someone anticipated this but never wired it up.

| Area | Current state | Location |
|---|---|---|
| Org status/plan | Enums exist, unenforced anywhere | `organizations` table, `20260506_platform_foundation.sql:16` |
| Campaign lifecycle | `draft \| active \| completed` only — no `archived`, no `cancelled` | `campaigns.status` check constraint |
| Campaign creation | Defaults to `draft`, but caller can pass `status: "active"` directly — no server-side "must start as draft" rule | `app/api/admin/campaigns/route.ts:231` |
| Campaign activation | No dedicated endpoint. A generic PATCH flips `status`; an unused `action: "launch"` code path exists with zero client call sites | `app/api/admin/campaigns/[id]/route.ts:162-169` |
| Billing / licensing | Nothing. No tables, no columns beyond `plan`, `status`, `billing_email` | — |
| Tenant isolation | RLS policies exist but every API route uses the service-role client, which bypasses RLS — isolation is enforced entirely by manual `.eq("organization_id", …)` filters in app code | `lib/supabase/server.ts:6-8` |
| Evidence storage | Direct `supabase.storage.from("evidence")` calls at 4+ route files, no shared abstraction, no per-row bucket/provider metadata | `app/api/agent/visits/[id]/evidence/route.ts:80` |
| Super admin | Established role, audit log, and platform-settings pattern ready to extend | `lib/platform/server.ts` |

**Campaign creation and activation, concretely.** Creation is `POST /api/admin/campaigns`. It checks the caller is an `admin`/`super_admin` with `org_admin` membership, validates the workflow config, then inserts with `status: payload.status || "draft"`. There is no "activate" button or endpoint in the product today — the admin campaign edit page exposes a raw status `<Select>`, and PATCHing `status: "active"` stamps `launched_at`. That PATCH handler, at `app/api/admin/campaigns/[id]/route.ts:162-169`, is the single choke point every activation funnels through today, which makes it the natural hook for a commercial gate.

**Archival, today, means delete.** Because the `campaigns.status` check constraint only permits `draft | active | completed`, there is no archived state at all. The only way to remove a campaign from view today is `DELETE /api/admin/campaigns/[id]`, which hard-deletes the row and cascades to evidence, visits, sales, and outlets. Any archival feature needs a schema change before it can exist.

**Evidence and storage.** Evidence lives in `visit_evidence`, uploaded to a single private Supabase bucket named `evidence`, with tenant separation coming entirely from a path prefix (`{organizationId}/{visitId}/…`), not from bucket-per-tenant or a stored bucket column. Reads go through `createSignedUrls` at three separate call sites (`app/api/agent/submissions/[id]/route.ts`, `lib/campaign/intelligence.ts`, the admin evidence gallery route). Reports and CSV exports (`app/api/admin/reports/export/route.ts`) don't touch evidence at all — only the campaign evidence gallery does — which narrows the surface a storage-tiering change needs to touch.

**Offline sync has no commercial or org-status awareness.** `POST /api/agent/sync/batch` checks role and org membership only. A suspended org's agents could sync data today as long as their JWT is valid — worth deciding deliberately (see [§2](#2-problems-with-the-existing-implementation)) rather than leaving as an oversight.

---

## 2. Problems with the existing implementation

- **Decorative enums.** `organizations.status` and `.plan` look like they gate something. They gate nothing. Building commercial logic on top of them without a real domain model would just be hardcoding with extra steps.
- **Zero commercial domain.** There's no representation anywhere of an activation fee, a hosting allocation, an invoice, or a payment. This is a from-scratch domain, not an extension of one.
- **Archival is destructive.** "Archived campaign" today means "deleted campaign." A retention/archival feature cannot reuse any existing mechanism — it needs a genuinely new, non-destructive state.
- **No storage abstraction.** `supabase.storage.from("evidence")` is called directly in at least four route files. Introducing R2 as a second storage tier means touching all of them unless they're consolidated behind an interface first.
- **Duplicated status enums client-side.** The `draft/active/completed` set is hand-copied into five-plus page files instead of a shared constant — widening it for archived/cancelled means finding all of them.
- **RLS is not load-bearing.** Every server route uses the service-role client. Any new billing table is only as tenant-safe as the discipline of manually filtering by `organization_id` in every route that touches it — the same discipline the rest of the codebase already relies on, so at least it's a known pattern, not a new risk class.

---

## 3. Proposed domain model

Four new entities, three names rejected — revised once after a design review that pushed on responsibility boundaries. The chain follows the shape given in the brief, with one clarification: invoices attach to the *billing account* directly (an implementation-fee invoice has no campaign), and optionally reference a campaign activation when they're campaign-specific.

> **Revised after design review**
> - **Pricing left `CampaignActivation`.** `activation_fee_amount` moved to `CampaignInvoice` — approval and pricing are different concerns and should change independently.
> - **Approval history got its own table.** `approved_by`/`approved_at`/`rejection_reason` moved off the main row into `CampaignActivationHistory`, so a reject → re-approve cycle doesn't overwrite the record of what happened the first time.
> - **Payment provider refs got their own table.** `PaymentProviderConnection` replaces a jsonb blob on `BillingAccount` — needed the moment a second provider, or a provider switch, has to coexist with the first rather than just today's "one active provider" case.
> - **`InfrastructureAllocation` now anchors on the organization, not the campaign.** `organization_id` is required; `campaign_activation_id` is optional. Campaign-scoped tiers (hot storage for one campaign's run) keep both; pooled or future org-level resources (AI/OCR, analytics, API access) set only the first. Biggest change in this pass — see below.
> - **`invoice_type` narrowed to a category, not an exhaustive list.** A fixed enum of every billable line item becomes a migration every time a new product ships — see [§4](#4-database-changes).
> - **Invoices got line items.** `CampaignInvoice` is now a header row; `CampaignInvoiceLineItem` holds the amounts — shaped so a future product catalog can populate line items without reshaping the invoice table again.

**Entity chain:**

```
Organization
    │ 1:1
    ▼
BillingAccount ─── 1:many ──▶ PaymentProviderConnection
  (standing, implementation-fee     (Stripe, Paystack, manual, bank
   status, currency, contact)         transfer — historized)
    │ 1:many
    ▼
CampaignInvoice ─── 1:many ──▶ CampaignInvoiceLineItem
  (billing document header)          (amounts live here, ready for
    │ references (nullable)           a product catalog later)
    ▼
CampaignActivation ─── 1:many ──▶ CampaignActivationHistory
  (pure approval workflow —          (every transition: who, why, when)
   status only, no pricing)
    │
Organization ── 1:many, org required ──▶ InfrastructureAllocation
                                          (time-boxed hosting/storage/compute
                                           tiers — org-anchored, optionally
                                           attributed to one campaign)
```

**Entity verdicts:**

| Entity | Cardinality | Purpose | Verdict |
|---|---|---|---|
| `BillingAccount` | 1:1 per Organization | Commercial standing, implementation-fee status, default currency, billing contact | **Adopt** — trimmed; what's left is small enough to stay one table, but standing vs. contact should stay behind separate service functions so it doesn't become the dumping ground for every future commercial rule |
| `CampaignActivation` | 1:1 per Campaign | The approval workflow and commercial gate state for one specific campaign — status only | **Adopt** |
| `CampaignActivationHistory` | Many per CampaignActivation | Every status transition with actor, reason, timestamp | **Adopt (new)** — approve→reject→re-approve cycles need a real timeline, not three overwritable columns |
| `CampaignInvoice` | Many per BillingAccount, optional FK to CampaignActivation | Billing document header — one-time, per-campaign, or archival | **Adopt** |
| `CampaignInvoiceLineItem` | Many per CampaignInvoice | The actual amounts — description, quantity, price | **Adopt (new)** — splitting header from lines now avoids reshaping invoices later once a product catalog exists |
| `PaymentProviderConnection` | Many per BillingAccount | One row per external provider customer/connection | **Adopt (new)** — replaces a jsonb blob on BillingAccount; supports provider history and coexistence, not just "the current one" |
| `InfrastructureAllocation` | Many per Organization, optional FK to CampaignActivation | Hosting/storage/compute tier periods, campaign-attributed or org-pooled | **Adopt, revised** — anchored on the org because capacity (storage quotas, future AI/OCR/analytics) is an org-level resource; campaign attribution is now an optional tag, not the primary key |
| `OrganizationSubscription` | — | Would imply recurring SaaS billing | **Reject** — the business model is explicitly one-time + per-campaign, not a subscription. Naming it "subscription" invites recurring-billing assumptions (renewal dates, proration) that don't apply. |
| `PlatformLicense` | — | "Right to use the platform at all" | **Reject, for now** — has no lifecycle independent of `BillingAccount.implementation_fee_status`. Revisit only if per-module licensing (e.g. licensing the workflow builder separately from reporting) becomes a real requirement. |
| `OrganizationBilling` | — | Same concept as BillingAccount | **Reject** — naming collision with `BillingAccount`; pick one to avoid two tables meaning the same thing. |

### Decoupling: one eligibility service, not scattered checks

The brief's instruction not to hardcode checks is best satisfied by a single seam: `lib/billing/eligibility.ts` exporting `checkCampaignActivationEligibility(organizationId, campaignId)`, returning `{ eligible, reason, blockingInvoiceIds? }`. Campaign routes call this function and act on its verdict; they never query billing tables directly, and billing logic never imports campaign types. The service is the only place that reads `BillingAccount.status`, `CampaignActivation.activation_status`, and outstanding `CampaignInvoice` rows together.

### Campaign lifecycle: extend, but on two axes, not one

The requested lifecycle — Draft → Awaiting Commercial Approval → Approved → Active → Completed → Archived → Cancelled — mixes two independent concerns if it's all crammed into `campaigns.status`. "Awaiting Commercial Approval" isn't an operational state; a campaign in that state is still structurally a draft. Recommendation: keep two orthogonal fields.

- **`campaigns.status`** (operational, widened): `draft | active | completed | archived | cancelled` — what the campaign is doing.
- **`campaign_activations.activation_status`** (commercial, new): `pending_approval | approved | rejected | active | expired` — whether it's commercially cleared to run.

A campaign only flips to `campaigns.status = "active"` once its `CampaignActivation.activation_status = "approved"`. This avoids a combinatorial mess later (a `completed` campaign with an unpaid infra invoice doesn't need its own status — it's `completed` + an `overdue` invoice, two facts, not one state).

```
Draft → Awaiting Approval → Approved → Active → Completed → Archived
  │            (activation_status)
  └──▶ Cancelled
```

### Deferred: product catalog & pricing

Invoices are hand-created for now — an admin picks a category and types an amount. That's fine for five billable things. It stops being fine once the lineup grows to AI/OCR, premium analytics, API access, support, training, and whatever comes after. The fix is a `ProductCatalog` → `PriceBook` → `CampaignInvoiceLineItem` chain, where line items reference a catalog entry instead of embedding a raw description and price by hand. Not building it now — but `CampaignInvoiceLineItem` (§4) is shaped so a `catalog_item_id` can be added to it later without touching anything upstream. The catalog itself is a separate, later effort.

---

## 4. Database changes

New migration, following the repo's existing additive/idempotent convention: `supabase/migrations/20260706_billing_and_commercial_lifecycle.sql`.

```sql
create table if not exists public.billing_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  account_status text not null default 'in_good_standing'
    check (account_status in ('in_good_standing','past_due','suspended','closed')),
  implementation_fee_status text not null default 'pending'
    check (implementation_fee_status in ('pending','invoiced','paid','waived')),
  billing_contact_name text, billing_contact_email text,
  default_currency text not null default 'NGN',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_provider_connections (
  id uuid primary key default gen_random_uuid(),
  billing_account_id uuid not null references public.billing_accounts(id) on delete cascade,
  provider text not null check (provider in ('stripe','paystack','manual','bank_transfer')),
  external_customer_id text,
  status text not null default 'active' check (status in ('active','inactive','revoked')),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.campaign_activations (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null unique references public.campaigns(id) on delete cascade,
  billing_account_id uuid not null references public.billing_accounts(id),
  activation_status text not null default 'pending_approval'
    check (activation_status in ('pending_approval','approved','rejected','active','expired')),
  infra_allocation_tier text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
  -- no pricing, no approver/reason here — see campaign_activation_history and campaign_invoices
);

create table if not exists public.campaign_activation_history (
  id uuid primary key default gen_random_uuid(),
  campaign_activation_id uuid not null references public.campaign_activations(id) on delete cascade,
  from_status text, to_status text not null,
  actor_id uuid references auth.users(id),
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.campaign_invoices (
  id uuid primary key default gen_random_uuid(),
  billing_account_id uuid not null references public.billing_accounts(id),
  campaign_activation_id uuid references public.campaign_activations(id), -- null: implementation/enhancement
  invoice_category text not null
    check (invoice_category in ('one_time','per_campaign','recurring','usage_based')),
  invoice_subtype text not null,  -- 'implementation' | 'activation' | 'infrastructure' | 'archive_storage' | 'reactivation' | future catalog codes
                                  -- validated in application code against a known-subtype list, not a check constraint —
                                  -- the list grows with the product; this column shouldn't require a migration to extend
  amount numeric(12,2) not null, -- denormalized total, kept in sync with the sum of its line items
  currency text not null default 'NGN',
  status text not null default 'draft'
    check (status in ('draft','sent','paid','overdue','void')),
  due_date date,
  paid_at timestamptz,
  payment_provider_connection_id uuid references public.payment_provider_connections(id),
  external_reference text,      -- provider invoice/charge id
  created_at timestamptz not null default now()
);

create table if not exists public.campaign_invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  campaign_invoice_id uuid not null references public.campaign_invoices(id) on delete cascade,
  description text not null,
  quantity numeric(10,2) not null default 1,
  unit_amount numeric(12,2) not null
  -- catalog_item_id uuid — deliberately omitted until a ProductCatalog exists (see §3); additive to add later
);

create table if not exists public.infrastructure_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_activation_id uuid references public.campaign_activations(id), -- optional: null for org-pooled resources
  allocation_type text not null
    check (allocation_type in ('compute','storage_hot','storage_retention','storage_archive')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  status text not null default 'active' check (status in ('active','expired','migrated')),
  cost_amount numeric(12,2)
);

-- widen operational lifecycle to add archived + cancelled
alter table public.campaigns drop constraint if exists campaigns_status_check;
alter table public.campaigns add constraint campaigns_status_check
  check (status in ('draft','active','completed','archived','cancelled'));

-- indexes + RLS mirroring the existing organizations/campaigns pattern
create index if not exists idx_billing_accounts_org on public.billing_accounts(organization_id);
create index if not exists idx_campaign_activations_billing_account on public.campaign_activations(billing_account_id);
create index if not exists idx_campaign_invoices_billing_account on public.campaign_invoices(billing_account_id);
create index if not exists idx_infrastructure_allocations_org on public.infrastructure_allocations(organization_id);
-- RLS: is_super_admin() full access, is_org_member(organization_id) read-only, same helpers as 20260506_platform_foundation.sql
```

All seven tables get RLS policies built on the existing `is_super_admin()` / `is_org_member(organization_id)` helpers, consistent with every other tenant-scoped table — and, per [§2](#2-problems-with-the-existing-implementation), every API route touching them must still filter by `organization_id` manually, since RLS is not what's actually enforcing isolation in this codebase.

---

## 5. Backend / API changes

| Route | Change |
|---|---|
| `app/api/admin/campaigns/route.ts` | On create, also insert a `campaign_activations` row (`pending_approval`) — so the approval queue is populated the moment a campaign exists, not only on first activation attempt. |
| `app/api/admin/campaigns/[id]/route.ts` | Before any transition to `status: "active"` (line 162-169, the existing single choke point), call `checkCampaignActivationEligibility()`. Ineligible → 409 with a structured reason, not a bare 403. |
| `app/api/admin/billing/route.ts` *(new)* | Org-scoped read: own billing account, invoices, campaign activation statuses. Powers the org admin billing dashboard. |
| `app/api/platform/billing/accounts/route.ts` *(new)* | Super admin: list/search billing accounts across orgs, outstanding balances. |
| `app/api/platform/billing/activations/[id]/approve\|reject/route.ts` *(new)* | Super admin approval/rejection actions on a `campaign_activations` row; writes to `platform_audit_logs` via the existing `writePlatformAuditLog` helper. |
| `app/api/platform/billing/invoices/route.ts` *(new)* | Create/list invoices; manual-approval and bank-transfer-confirmation actions live here as one payment method among several. |
| `app/api/webhooks/stripe`, `/paystack` *(new, later phase)* | Provider webhooks update `campaign_invoices.status` via a shared `PaymentProvider` interface — see §11. |
| `app/api/agent/sync/batch/route.ts` | Add an org-status check (`billing_accounts.account_status !== 'suspended'`) — deliberate policy call, not silent gap-filling. Only the strongest suspension tier blocks sync; the per-campaign gate is the primary mechanism. |

---

## 6. Frontend / UI changes

- **Blocked-activation screen** — a dedicated component (not a raw error page) shown when eligibility fails: explains that activation requires commercial approval, states what's outstanding in plain language, and gives a clear next step (contact billing / view invoice). Historical data, reports, and evidence stay fully reachable from the same screen.
- **Org admin billing dashboard** (`/admin/billing`) — outstanding balance, invoice list, payment history, and a per-campaign activation status list.
- **Outstanding-payment banner** — persistent but non-blocking, shown platform-wide when the account is `past_due`. Never hides login, reports, or existing campaigns.
- **Campaign creation/edit pages** — replace the duplicated status `<Select>` enums (five-plus files, see §2) with a shared constant, and surface the campaign's `activation_status` next to its operational status once both exist.

---

## 7. Super Admin changes

New section under `app/super-admin/billing/*`, alongside the existing `organizations` section:

- Billing accounts list with outstanding balance, standing, implementation-fee status
- Campaign activation approval queue — the `pending_approval` backlog, one-click approve/reject with a reason
- Invoice history and payment history per org, including manual bank-transfer confirmation
- Infrastructure allocation view — active allocations, tier, cost, window
- Storage consumption per org (extends the existing usage-stats aggregation already in `app/api/platform/organizations/[id]/route.ts`, which already sums `visit_evidence.file_size`)
- Retention countdown per completed campaign, and archive controls (§12)

---

## 8. Migration strategy

Nothing about this should retroactively block an existing tenant. Two moves make that true:

1. **Grandfather everything that exists today.** Backfill one `billing_accounts` row per existing organization with `implementation_fee_status = 'paid'` and `account_status = 'in_good_standing'`. Backfill one `campaign_activations` row per existing campaign, regardless of its current status, with `activation_status = 'approved'` and a note like `"grandfathered — pre-commercial-launch"`. This keeps every future join against `campaign_activations` total (no null-handling for pre-existing campaigns) without changing anyone's access today.
2. **Gate behind namespaced flags, not one switch.** `platform_settings` rows `commercial.activation.enabled`, `commercial.archive.enabled`, and `commercial.payments.enabled` (plus a per-org `billing_accounts.gating_override` for activation specifically) let each capability roll out and roll back independently — the storage/archival track (§12) shouldn't have to wait on the activation gate, or vice versa. Ship the schema and services dark first; flip `commercial.activation.enabled` only once the super admin console can actually process approvals.

---

## 9. Rollout plan

| Phase | Name | Description |
|---|---|---|
| A | Dark launch | Schema, backfill, eligibility service shipped with the gate flag off. No visible change to any tenant. |
| B | Informational only | Super admin billing console live, invoices can be created and tracked manually. Gate still off — this phase is about proving the billing data model against real usage before it can block anyone. |
| C | New organizations only | Enable the gate for organizations onboarded after a cutover date. Existing tenants remain grandfathered and unaffected. |
| D | Platform-wide | Enable the gate for all organizations, with advance communication and a grace period on any already-outstanding implementation fees. |
| E | Payment automation | Stripe/Paystack webhooks replace manual invoice-status updates for orgs that opt into card/online payment. |
| F | Storage lifecycle | Archival and R2 migration, per §12 — deliberately last, since it's the highest-blast-radius piece (moving real evidence files) and depends on nothing else in this plan. |

---

## 10. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Eligibility bug blocks a legitimate campaign activation | **High** | Feature flag with a dry-run/log-only mode before hard enforcement; every denial is logged with the exact reason for fast triage. |
| Existing customers feel blindsided by a sudden gate | **High** | Grandfather clause (§8) + advance comms in Phase D; nothing existing is ever retroactively blocked. |
| R2 migration silently loses or corrupts evidence | **High** | Checksum verification, dry-run mode, no source deletion until verified — detailed in §12. |
| New billing table leaks across tenants because a route forgets the `organization_id` filter | **Medium** | Same manual-filter discipline the rest of the codebase already relies on (§2); worth a shared `withOrgScope` helper to make the mistake harder to make. |
| Payment webhook missed or delayed → invoice shows unpaid after money received | **Medium** | Nightly reconciliation job against provider APIs; manual override always available to super admin. |
| Duplicate invoice generation on retry | **Low** | Idempotency keys — already an established pattern in this codebase (evidence upload, sync batch). |
| Suspending an org for non-payment accidentally cuts off agents mid-campaign | **Medium** | Two severity tiers: per-campaign gate (default, blocks only new activation) vs. full org suspension (rare, explicit action, also halts sync) — never conflate the two. |

---

## 11. Recommended phased implementation

Engineering build order — distinct from §9's deployment/comms sequencing.

1. Migration: seven new tables + widened `campaigns.status` constraint + backfill script (§4, §8)
2. `lib/billing/eligibility.ts` — the single eligibility service, unit-testable in isolation from campaign code
3. Wire the eligibility check into the one activation choke point (`app/api/admin/campaigns/[id]/route.ts:162-169`), gated by the dark-launch flag
4. Org admin billing dashboard + blocked-activation screen (read-only against real data, still gate-off)
5. Super admin billing console: accounts list, approval queue, invoice/payment recording (manual methods first — bank transfer, manual approval)
6. Payment provider adapters: define a `PaymentProvider` interface (`createInvoice`, `getPaymentStatus`, `handleWebhook`) with a `ManualProvider` default, then add Stripe and Paystack implementations without touching the domain model
7. Storage abstraction + R2 (§12) — independent track, can start in parallel with steps 2-6

---

## 12. Data archival & Cloudflare R2 plan

Evidence images are the platform's largest storage cost and the thing "archival" actually means in practice. This section is independent of the billing build and can proceed in parallel.

### Storage tiers, mapped to campaign lifecycle

| Campaign state | Storage tier | Behavior |
|---|---|---|
| `active` | Hot — Supabase Storage | Unchanged from today: uploads, evidence gallery, reports all fast-path. |
| `completed`, within retention window | Hot — Supabase Storage | Fully accessible for an agreed window (default from `platform_settings.default_media_retention_days`, overridable per org via `billing_accounts`). |
| `archived` | Cold — Cloudflare R2 | Campaign is read-only; structured data (visits, sales, reports) stays in Postgres; media moves to R2 and is fetched via signed URL on demand. |

### Storage provider abstraction

Today, `supabase.storage.from("evidence")` is called directly in four route files with no shared interface. Introduce `lib/storage/provider.ts`:

```ts
interface StorageProvider {
  uploadEvidenceFile(input: UploadInput): Promise<EvidenceLocation>;
  getEvidenceSignedUrl(row: VisitEvidenceRow, ttlSeconds?: number): Promise<string>;
  deleteEvidenceFile(row: VisitEvidenceRow): Promise<void>;
  archiveEvidenceFile(row: VisitEvidenceRow): Promise<EvidenceLocation>;   // -> writes to R2
  restoreEvidenceFile(row: VisitEvidenceRow): Promise<string>;             // -> signed URL, rehydrate if needed
  migrateEvidenceToArchiveStorage(rows: VisitEvidenceRow[], opts: { dryRun?: boolean }): Promise<MigrationResult>;
}
// implementations: SupabaseStorageProvider, R2StorageProvider (S3-compatible SDK)
// a resolver picks the implementation per-row from visit_evidence.storage_provider
```

Every existing call site (`app/api/agent/visits/[id]/evidence/route.ts`, `app/api/agent/submissions/[id]/route.ts`, `app/api/admin/evidence/[id]/route.ts`, `lib/campaign/intelligence.ts`) is rewritten to call the interface instead of `supabase.storage` directly. This is the prerequisite for everything else in this section — R2 can't be introduced safely while four places each hardcode Supabase.

### Evidence metadata additions

`visit_evidence` already has `file_size`, `original_file_size`, `compressed_file_size`, and `mime_type` — new columns should reuse rather than duplicate these where possible. No `campaign_id` or `bucket` column exists today (campaign association is via `visit_id → visits.campaign_id`; bucket name `"evidence"` is hardcoded). New migration:

```sql
alter table public.visit_evidence
  add column if not exists storage_provider text not null default 'supabase'
    check (storage_provider in ('supabase','r2')),
  add column if not exists bucket text,
  add column if not exists object_key text,
  add column if not exists original_path text,
  add column if not exists archived_at timestamptz,
  add column if not exists archive_status text not null default 'hot'
    check (archive_status in ('hot','archiving','archived','restore_pending','restored')),
  add column if not exists checksum text,
  add column if not exists campaign_id uuid references public.campaigns(id);
  -- campaign_id denormalized from visits.campaign_id for migration-query performance;
  -- backfilled once, kept in sync at write time going forward

update public.visit_evidence ve set campaign_id = v.campaign_id
  from public.visits v where v.id = ve.visit_id and ve.campaign_id is null;
```

### R2 migration job

A batch job, not a request-time operation. The evidence recompression backfill already established the right shape (`supabase/migrations/20260612_evidence_recompression_migration_log.sql`) — this formalizes it one level further into an immutable manifest, since a data-moving job at this scale needs its own auditable record, not just status columns on `visit_evidence`:

```sql
create table if not exists public.evidence_migration_jobs (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('dry_run','live')),
  status text not null default 'running' check (status in ('running','completed','failed','rolled_back')),
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.evidence_migration_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.evidence_migration_jobs(id) on delete cascade,
  visit_evidence_id uuid not null references public.visit_evidence(id),
  source_checksum text, dest_checksum text,
  status text not null default 'pending'
    check (status in ('pending','copied','verified','failed','rolled_back')),
  error text,
  created_at timestamptz not null default now()
);
```

1. A job opens against a candidate set — `archive_status = 'hot'`, parent campaign `archived`, retention window elapsed — one `evidence_migration_items` row per file, all `pending`
2. Copy bytes Supabase → R2; compute and compare checksum; the item moves to `copied` then `verified`, or `failed` with the mismatch recorded — a failed item does not proceed
3. Only once an item is `verified` does `visit_evidence` get updated: `storage_provider = 'r2'`, `bucket`, `object_key`, `archived_at`, `archive_status = 'archived'`
4. The Supabase original stays in place for a grace period; a separate, later job deletes it only after independent re-verification — never in the same run as the copy
5. `mode = 'dry_run'` populates the manifest and reports without touching storage or `visit_evidence` at all
6. Batched and rate-limited against the Supabase Storage API; a failed run resumes from whatever's still `pending` in the manifest, not from zero
7. Runs off the request path entirely — scheduled, never triggered by live traffic

### Access model

Evidence stays private by default in both tiers. R2 is S3-compatible, so presigned GET URLs work the same way Supabase's `createSignedUrls` does today. The provider abstraction (above) means call sites ask for `getEvidenceSignedUrl(row)` and get a working URL regardless of which tier the file lives in — they don't need to know. Tenant isolation is unchanged: object keys keep the same `{organizationId}/{visitId}/…` prefixing convention, and the app layer only ever resolves a signed URL for rows already scoped to the caller's `organization_id`, exactly as it does today.

### Billing link

This is where §12 rejoins the commercial model in §3-4: a campaign's `CampaignActivation` covers `InfrastructureAllocation(allocation_type = 'storage_hot')` for the campaign's active period, plus a standard `storage_retention` allocation for the included post-completion window. Long-term archive storage is a separate, optionally billed `storage_archive` allocation — a scheduled job can sum `size_bytes` where `archive_status = 'archived'` per org and generate periodic `campaign_invoices` (subtype `archive_storage`). Restoring an archived campaign (`restoreEvidenceFile` at scale) is itself an invoice-worthy event: subtype `reactivation`.

### Archival rollout — two stages, not one

**Ship first (no existing files touched):** metadata columns · storage abstraction · R2 provider implementation · new uploads configurable by provider · evidence gallery reading transparently from both Supabase and R2.

**Ship later (touches real data):** migration scripts · scheduled campaign-archive job · super admin archive controls and retention countdowns.

Nothing in the first stage moves an existing file. It's purely additive — new capability sitting alongside the current all-Supabase behavior — which is what makes it safe to ship well before the migration itself is trusted.
