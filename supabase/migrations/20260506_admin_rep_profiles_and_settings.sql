-- Admin MVP: rep profiles + organization settings defaults

alter table public.organizations
  add column if not exists campaign_default_type text,
  add column if not exists default_target_per_rep integer,
  add column if not exists require_photo_evidence boolean not null default true,
  add column if not exists require_gps_capture boolean not null default true,
  add column if not exists offline_capture_enabled boolean not null default true,
  add column if not exists support_phone text;

create table if not exists public.rep_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rep_code text not null,
  state text,
  lga text,
  city text,
  target_outlets integer,
  target_conversions integer,
  assigned_supervisor_user_id uuid references auth.users(id) on delete set null,
  notes text,
  status text not null default 'active' check (status in ('active', 'inactive', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id),
  unique (organization_id, rep_code)
);

create index if not exists idx_rep_profiles_org on public.rep_profiles(organization_id);
create index if not exists idx_rep_profiles_user on public.rep_profiles(user_id);
create index if not exists idx_rep_profiles_supervisor on public.rep_profiles(assigned_supervisor_user_id);

drop trigger if exists trg_rep_profiles_updated_at on public.rep_profiles;
create trigger trg_rep_profiles_updated_at
before update on public.rep_profiles
for each row execute function public.touch_updated_at();

alter table public.rep_profiles enable row level security;

drop policy if exists rep_profiles_super_admin_all on public.rep_profiles;
create policy rep_profiles_super_admin_all
on public.rep_profiles
for all
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists rep_profiles_member_read on public.rep_profiles;
create policy rep_profiles_member_read
on public.rep_profiles
for select
using (public.is_super_admin() or public.is_org_member(organization_id));

