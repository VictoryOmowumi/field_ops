-- Admin foundation: outlets + sales + evidence + reporting indexes

create table if not exists public.outlets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  name text not null,
  outlet_type text,
  contact_person text,
  phone text,
  address text,
  state text,
  lga text,
  latitude double precision,
  longitude double precision,
  location_accuracy double precision,
  sync_status text not null default 'synced' check (sync_status in ('pending', 'synced', 'failed')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_outlets_org_campaign_created
  on public.outlets(organization_id, campaign_id, created_at desc);
create index if not exists idx_outlets_org_status
  on public.outlets(organization_id, sync_status);

drop trigger if exists trg_outlets_updated_at on public.outlets;
create trigger trg_outlets_updated_at
before update on public.outlets
for each row execute function public.touch_updated_at();

alter table public.outlets enable row level security;

drop policy if exists outlets_super_admin_all on public.outlets;
create policy outlets_super_admin_all
on public.outlets
for all
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists outlets_member_read on public.outlets;
create policy outlets_member_read
on public.outlets
for select
using (public.is_super_admin() or public.is_org_member(organization_id));

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  agent_id uuid references auth.users(id) on delete set null,
  product_name text not null,
  quantity integer not null default 1 check (quantity > 0),
  sales_value numeric(14,2),
  conversion_status text not null default 'pending' check (conversion_status in ('converted', 'pending', 'revisit')),
  notes text,
  latitude double precision,
  longitude double precision,
  location_accuracy double precision,
  sync_status text not null default 'synced' check (sync_status in ('pending', 'synced', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sales_org_campaign_created
  on public.sales(organization_id, campaign_id, created_at desc);
create index if not exists idx_sales_org_status
  on public.sales(organization_id, conversion_status, sync_status);

drop trigger if exists trg_sales_updated_at on public.sales;
create trigger trg_sales_updated_at
before update on public.sales
for each row execute function public.touch_updated_at();

alter table public.sales enable row level security;

drop policy if exists sales_super_admin_all on public.sales;
create policy sales_super_admin_all
on public.sales
for all
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists sales_member_read on public.sales;
create policy sales_member_read
on public.sales
for select
using (public.is_super_admin() or public.is_org_member(organization_id));

create table if not exists public.sale_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  file_url text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_sale_evidence_org_sale
  on public.sale_evidence(organization_id, sale_id, created_at desc);

alter table public.sale_evidence enable row level security;

drop policy if exists sale_evidence_super_admin_all on public.sale_evidence;
create policy sale_evidence_super_admin_all
on public.sale_evidence
for all
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists sale_evidence_member_read on public.sale_evidence;
create policy sale_evidence_member_read
on public.sale_evidence
for select
using (public.is_super_admin() or public.is_org_member(organization_id));

