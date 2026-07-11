-- Commercial licensing & billing domain (Phase 1: Commercial Foundation)
-- Additive only. No existing behavior changes. See docs/architecture/commercial-licensing-architecture.md
-- and docs/architecture/commercial-implementation-roadmap.md for the full design and rollout plan.
--
-- State machine this schema supports (campaigns.status is the operational axis, unchanged by
-- who's paid for what; campaign_activations.activation_status is the commercial axis):
--
--   campaigns.status:             draft -> active -> completed -> archived
--                                    \-> cancelled (from draft, or from an unapproved activation)
--
--   campaign_activations.activation_status:
--     pending_approval  -- default on creation; commercial review not yet done
--       -> approved      -- commercially cleared to run, but the org hasn't flipped the
--                         --   campaign to Active yet (Phase 5). Can sit here for days —
--                         --   e.g. campaign's start_date is still in the future.
--       -> rejected       -- commercial review declined; campaign stays in draft until
--                         --   resubmitted (a fresh approval attempt reuses this same row)
--     approved -> active  -- set when the campaign actually transitions to campaigns.status
--                         --   = 'active' (Phase 5); marks the approval as "in use", not just
--                         --   "granted" — distinct from 'approved' so reporting can tell
--                         --   "cleared but not yet launched" apart from "currently running"
--     active -> expired    -- future policy hook: e.g. an approval granted for a bounded
--                         --   window that lapsed before the campaign was ever launched
--
-- IMPORTANT: the `alter table campaigns ... drop/add constraint` below is the one non-additive
-- statement in this file. Before applying, run `select distinct status from campaigns;` against
-- the target database and confirm every value is already one of draft/active/completed — this
-- migration only widens the constraint, it never rewrites existing rows.

create table if not exists public.billing_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  account_status text not null default 'in_good_standing'
    check (account_status in ('in_good_standing', 'past_due', 'suspended', 'closed')),
  implementation_fee_status text not null default 'pending'
    check (implementation_fee_status in ('pending', 'invoiced', 'paid', 'waived')),
  billing_contact_name text,
  billing_contact_email text,
  default_currency text not null default 'NGN',
  gating_override boolean,
  payment_provider text not null default 'manual'
    check (payment_provider in ('manual', 'stripe', 'paystack')),
  retention_days integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_billing_accounts_org on public.billing_accounts(organization_id);

create table if not exists public.payment_provider_connections (
  id uuid primary key default gen_random_uuid(),
  billing_account_id uuid not null references public.billing_accounts(id) on delete cascade,
  provider text not null check (provider in ('stripe', 'paystack', 'manual', 'bank_transfer')),
  external_customer_id text,
  status text not null default 'active' check (status in ('active', 'inactive', 'revoked')),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_payment_provider_connections_billing_account
  on public.payment_provider_connections(billing_account_id);

create table if not exists public.campaign_activations (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null unique references public.campaigns(id) on delete cascade,
  billing_account_id uuid not null references public.billing_accounts(id),
  activation_status text not null default 'pending_approval'
    check (activation_status in ('pending_approval', 'approved', 'rejected', 'active', 'expired')),
  infra_allocation_tier text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
  -- deliberately no pricing, approver, or rejection-reason columns here:
  -- pricing lives in campaign_invoices, transition history lives in campaign_activation_history
);

create index if not exists idx_campaign_activations_billing_account
  on public.campaign_activations(billing_account_id);
create index if not exists idx_campaign_activations_status
  on public.campaign_activations(activation_status);

create table if not exists public.campaign_activation_history (
  id uuid primary key default gen_random_uuid(),
  campaign_activation_id uuid not null references public.campaign_activations(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_user_id uuid references auth.users(id),
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_campaign_activation_history_activation
  on public.campaign_activation_history(campaign_activation_id);

create table if not exists public.campaign_invoices (
  id uuid primary key default gen_random_uuid(),
  billing_account_id uuid not null references public.billing_accounts(id),
  campaign_activation_id uuid references public.campaign_activations(id), -- null: implementation/enhancement invoices
  invoice_category text not null
    check (invoice_category in ('one_time', 'per_campaign', 'recurring', 'usage_based')),
  invoice_subtype text not null,
  -- 'implementation' | 'activation' | 'infrastructure' | 'archive_storage' | 'reactivation' | future catalog codes.
  -- Validated in application code against a known-subtype list, not a check constraint, so the list can grow
  -- with the product (new billable line items) without requiring a migration.
  amount numeric(12, 2) not null default 0, -- denormalized total, kept in sync with the sum of its line items
  currency text not null default 'NGN',
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'paid', 'overdue', 'void')),
  due_date date,
  paid_at timestamptz,
  payment_provider_connection_id uuid references public.payment_provider_connections(id),
  external_reference text,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_campaign_invoices_billing_account
  on public.campaign_invoices(billing_account_id);
create index if not exists idx_campaign_invoices_activation
  on public.campaign_invoices(campaign_activation_id);
create index if not exists idx_campaign_invoices_status
  on public.campaign_invoices(status);
create index if not exists idx_campaign_invoices_billing_account_status
  on public.campaign_invoices(billing_account_id, status);
-- ^ the composite index a "show unpaid/overdue invoices for this account" query needs — the
-- single-column indexes above are kept too since some queries (e.g. platform-wide "all overdue
-- invoices") filter on status alone.

create table if not exists public.campaign_invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  campaign_invoice_id uuid not null references public.campaign_invoices(id) on delete cascade,
  description text not null,
  quantity numeric(10, 2) not null default 1,
  unit_amount numeric(12, 2) not null,
  created_at timestamptz not null default now()
  -- catalog_item_id intentionally omitted until a ProductCatalog exists; additive to add later.
);

create index if not exists idx_campaign_invoice_line_items_invoice
  on public.campaign_invoice_line_items(campaign_invoice_id);

-- Keep campaign_invoices.amount in sync with its line items at the database layer, not just in
-- application code. amount is a denormalized total kept for cheap list/report queries, but it
-- must never be able to drift from a line-item edit that forgot to recompute it — a real risk
-- once anything besides invoice-service.ts starts touching line items.
create or replace function public.recalculate_campaign_invoice_amount()
returns trigger
language plpgsql
as $$
declare
  target_invoice_id uuid;
begin
  target_invoice_id := coalesce(new.campaign_invoice_id, old.campaign_invoice_id);
  update public.campaign_invoices
  set amount = coalesce((
    select sum(quantity * unit_amount)
    from public.campaign_invoice_line_items
    where campaign_invoice_id = target_invoice_id
  ), 0)
  where id = target_invoice_id;
  return null;
end;
$$;

drop trigger if exists trg_campaign_invoice_line_items_recalculate on public.campaign_invoice_line_items;
create trigger trg_campaign_invoice_line_items_recalculate
after insert or update or delete on public.campaign_invoice_line_items
for each row execute function public.recalculate_campaign_invoice_amount();

create table if not exists public.infrastructure_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_activation_id uuid references public.campaign_activations(id), -- optional: null for org-pooled resources
  allocation_type text not null
    check (allocation_type in ('compute', 'storage_hot', 'storage_retention', 'storage_archive')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  status text not null default 'active' check (status in ('active', 'expired', 'migrated')),
  cost_amount numeric(12, 2),
  -- Sizing (GB allocated, compute tier, etc.) deliberately isn't a rigid column set yet — no
  -- concrete sizing requirement exists until Phase 7 (R2) needs to track bytes migrated.
  -- metadata is the escape valve so that need doesn't require a schema change when it arrives.
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_infrastructure_allocations_org
  on public.infrastructure_allocations(organization_id);
create index if not exists idx_infrastructure_allocations_activation
  on public.infrastructure_allocations(campaign_activation_id);

-- Widen the operational campaign lifecycle to add archived + cancelled.
-- Unused until Phase 8 (Campaign Archival), but the constraint change is safest done once, early, while risk is zero.
alter table public.campaigns drop constraint if exists campaigns_status_check;
alter table public.campaigns add constraint campaigns_status_check
  check (status in ('draft', 'active', 'completed', 'archived', 'cancelled'));

-- updated_at triggers, matching the existing public.touch_updated_at() convention
drop trigger if exists trg_billing_accounts_updated_at on public.billing_accounts;
create trigger trg_billing_accounts_updated_at
before update on public.billing_accounts
for each row execute function public.touch_updated_at();

drop trigger if exists trg_campaign_activations_updated_at on public.campaign_activations;
create trigger trg_campaign_activations_updated_at
before update on public.campaign_activations
for each row execute function public.touch_updated_at();

drop trigger if exists trg_campaign_invoices_updated_at on public.campaign_invoices;
create trigger trg_campaign_invoices_updated_at
before update on public.campaign_invoices
for each row execute function public.touch_updated_at();

-- RLS: mirrors the existing organizations/campaigns pattern (is_super_admin() full access,
-- is_org_member(organization_id) read-only). Every application route must still filter by
-- organization_id manually, since all server routes use the service-role client and bypass RLS.
alter table public.billing_accounts enable row level security;
alter table public.payment_provider_connections enable row level security;
alter table public.campaign_activations enable row level security;
alter table public.campaign_activation_history enable row level security;
alter table public.campaign_invoices enable row level security;
alter table public.campaign_invoice_line_items enable row level security;
alter table public.infrastructure_allocations enable row level security;

drop policy if exists billing_accounts_super_admin_all on public.billing_accounts;
create policy billing_accounts_super_admin_all
on public.billing_accounts
for all
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists billing_accounts_member_read on public.billing_accounts;
create policy billing_accounts_member_read
on public.billing_accounts
for select
using (public.is_super_admin() or public.is_org_member(organization_id));

drop policy if exists payment_provider_connections_super_admin_all on public.payment_provider_connections;
create policy payment_provider_connections_super_admin_all
on public.payment_provider_connections
for all
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists payment_provider_connections_member_read on public.payment_provider_connections;
create policy payment_provider_connections_member_read
on public.payment_provider_connections
for select
using (
  public.is_super_admin()
  or exists (
    select 1 from public.billing_accounts ba
    where ba.id = payment_provider_connections.billing_account_id
      and public.is_org_member(ba.organization_id)
  )
);

drop policy if exists campaign_activations_super_admin_all on public.campaign_activations;
create policy campaign_activations_super_admin_all
on public.campaign_activations
for all
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists campaign_activations_member_read on public.campaign_activations;
create policy campaign_activations_member_read
on public.campaign_activations
for select
using (
  public.is_super_admin()
  or exists (
    select 1 from public.campaigns c
    where c.id = campaign_activations.campaign_id
      and public.is_org_member(c.organization_id)
  )
);

drop policy if exists campaign_activation_history_super_admin_all on public.campaign_activation_history;
create policy campaign_activation_history_super_admin_all
on public.campaign_activation_history
for all
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists campaign_activation_history_member_read on public.campaign_activation_history;
create policy campaign_activation_history_member_read
on public.campaign_activation_history
for select
using (
  public.is_super_admin()
  or exists (
    select 1 from public.campaign_activations ca
    join public.campaigns c on c.id = ca.campaign_id
    where ca.id = campaign_activation_history.campaign_activation_id
      and public.is_org_member(c.organization_id)
  )
);

drop policy if exists campaign_invoices_super_admin_all on public.campaign_invoices;
create policy campaign_invoices_super_admin_all
on public.campaign_invoices
for all
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists campaign_invoices_member_read on public.campaign_invoices;
create policy campaign_invoices_member_read
on public.campaign_invoices
for select
using (
  public.is_super_admin()
  or exists (
    select 1 from public.billing_accounts ba
    where ba.id = campaign_invoices.billing_account_id
      and public.is_org_member(ba.organization_id)
  )
);

drop policy if exists campaign_invoice_line_items_super_admin_all on public.campaign_invoice_line_items;
create policy campaign_invoice_line_items_super_admin_all
on public.campaign_invoice_line_items
for all
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists campaign_invoice_line_items_member_read on public.campaign_invoice_line_items;
create policy campaign_invoice_line_items_member_read
on public.campaign_invoice_line_items
for select
using (
  public.is_super_admin()
  or exists (
    select 1 from public.campaign_invoices ci
    join public.billing_accounts ba on ba.id = ci.billing_account_id
    where ci.id = campaign_invoice_line_items.campaign_invoice_id
      and public.is_org_member(ba.organization_id)
  )
);

drop policy if exists infrastructure_allocations_super_admin_all on public.infrastructure_allocations;
create policy infrastructure_allocations_super_admin_all
on public.infrastructure_allocations
for all
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists infrastructure_allocations_member_read on public.infrastructure_allocations;
create policy infrastructure_allocations_member_read
on public.infrastructure_allocations
for select
using (public.is_super_admin() or public.is_org_member(organization_id));

-- Namespaced feature flags for the commercial rollout (see docs/architecture/commercial-implementation-roadmap.md).
-- All default off; nothing in this migration wires them up to any enforcement yet.
insert into public.platform_settings (key, value, section, label)
values
  ('commercial.activation.enabled', 'false', 'Commercial', 'Commercial activation gate enabled'),
  ('commercial.archive.enabled', 'false', 'Commercial', 'Campaign archival scheduler enabled'),
  ('commercial.storage.enabled', 'false', 'Commercial', 'R2 storage migration enabled'),
  ('commercial.payments.enabled', 'false', 'Commercial', 'Automated payment processing enabled')
on conflict (key) do nothing;
