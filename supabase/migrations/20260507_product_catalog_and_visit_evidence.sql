-- Product catalog + visit evidence uploads

create table if not exists public.product_catalog (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  name text not null,
  brand text,
  category text,
  industry text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_product_catalog_org_name_ci
  on public.product_catalog((coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid)), lower(name));

create index if not exists idx_product_catalog_org_created
  on public.product_catalog(organization_id, created_at desc);

alter table public.product_catalog enable row level security;

drop policy if exists product_catalog_super_admin_all on public.product_catalog;
create policy product_catalog_super_admin_all
on public.product_catalog
for all
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists product_catalog_member_read on public.product_catalog;
create policy product_catalog_member_read
on public.product_catalog
for select
using (
  public.is_super_admin()
  or organization_id is null
  or public.is_org_member(organization_id)
);

create table if not exists public.visit_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  visit_id uuid not null references public.visits(id) on delete cascade,
  file_url text not null,
  file_name text,
  file_type text,
  file_size bigint,
  created_at timestamptz not null default now()
);

create index if not exists idx_visit_evidence_org_visit
  on public.visit_evidence(organization_id, visit_id, created_at desc);

alter table public.visit_evidence enable row level security;

drop policy if exists visit_evidence_super_admin_all on public.visit_evidence;
create policy visit_evidence_super_admin_all
on public.visit_evidence
for all
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists visit_evidence_member_read on public.visit_evidence;
create policy visit_evidence_member_read
on public.visit_evidence
for select
using (public.is_super_admin() or public.is_org_member(organization_id));

insert into storage.buckets (id, name, public)
values ('evidence', 'evidence', false)
on conflict (id) do nothing;

