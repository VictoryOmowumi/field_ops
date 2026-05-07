-- ActivationIQ platform foundation (phase 1)
-- Multi-tenant core tables + RLS baseline

create extension if not exists pgcrypto;

-- Organizations (tenants)
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  industry text,
  business_type text,
  logo_url text,
  website text,
  primary_contact_email text,
  primary_contact_phone text,
  country text not null default 'Nigeria',
  timezone text not null default 'Africa/Lagos',
  currency text not null default 'NGN',
  status text not null default 'active' check (status in ('active', 'suspended', 'trial', 'archived')),
  plan text not null default 'starter' check (plan in ('starter', 'growth', 'enterprise')),
  billing_email text,
  brand_primary_color text,
  brand_secondary_color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_organizations_status on public.organizations(status);

-- User profile metadata (mirrors auth user for app use)
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Membership / scoped roles inside organizations
create table if not exists public.organization_users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('org_admin', 'supervisor', 'agent')),
  status text not null default 'active' check (status in ('active', 'inactive', 'invited', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index if not exists idx_org_users_org on public.organization_users(organization_id);
create index if not exists idx_org_users_user on public.organization_users(user_id);

-- Minimal campaign baseline with tenant boundary
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  start_date date,
  end_date date,
  status text not null default 'draft' check (status in ('draft', 'active', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_campaigns_org on public.campaigns(organization_id);

-- Helpers for auth/RLS
create or replace function public.is_super_admin()
returns boolean
language sql
stable
as $$
  select public.current_app_role() = 'super_admin';
$$;

create or replace function public.is_org_member(org_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.organization_users ou
    where ou.organization_id = org_id
      and ou.user_id = auth.uid()
  );
$$;

-- updated_at trigger helper
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_organizations_updated_at on public.organizations;
create trigger trg_organizations_updated_at
before update on public.organizations
for each row execute function public.touch_updated_at();

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists trg_org_users_updated_at on public.organization_users;
create trigger trg_org_users_updated_at
before update on public.organization_users
for each row execute function public.touch_updated_at();

drop trigger if exists trg_campaigns_updated_at on public.campaigns;
create trigger trg_campaigns_updated_at
before update on public.campaigns
for each row execute function public.touch_updated_at();

-- RLS
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_users enable row level security;
alter table public.campaigns enable row level security;

-- organizations
drop policy if exists organizations_super_admin_all on public.organizations;
create policy organizations_super_admin_all
on public.organizations
for all
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists organizations_member_read on public.organizations;
create policy organizations_member_read
on public.organizations
for select
using (public.is_super_admin() or public.is_org_member(id));

-- profiles
drop policy if exists profiles_super_admin_all on public.profiles;
create policy profiles_super_admin_all
on public.profiles
for all
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read
on public.profiles
for select
using (user_id = auth.uid());

-- organization_users
drop policy if exists organization_users_super_admin_all on public.organization_users;
create policy organization_users_super_admin_all
on public.organization_users
for all
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists organization_users_member_read on public.organization_users;
create policy organization_users_member_read
on public.organization_users
for select
using (
  public.is_super_admin()
  or user_id = auth.uid()
  or public.is_org_member(organization_id)
);

-- campaigns
drop policy if exists campaigns_super_admin_all on public.campaigns;
create policy campaigns_super_admin_all
on public.campaigns
for all
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists campaigns_member_read on public.campaigns;
create policy campaigns_member_read
on public.campaigns
for select
using (public.is_super_admin() or public.is_org_member(organization_id));
