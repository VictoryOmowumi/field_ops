-- Campaign configuration + assignment model for admin workflows

alter table public.campaigns
  add column if not exists campaign_type text,
  add column if not exists state text,
  add column if not exists lga text,
  add column if not exists city text,
  add column if not exists target_outlets integer,
  add column if not exists target_conversions integer,
  add column if not exists expected_reps integer,
  add column if not exists outlet_types text[] not null default '{}',
  add column if not exists products jsonb not null default '[]'::jsonb,
  add column if not exists form_requirements jsonb not null default '{}'::jsonb,
  add column if not exists assigned_supervisor_user_id uuid references auth.users(id) on delete set null,
  add column if not exists launched_at timestamptz;

create table if not exists public.campaign_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('supervisor', 'agent')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, user_id, role)
);

create index if not exists idx_campaign_assignments_org on public.campaign_assignments(organization_id);
create index if not exists idx_campaign_assignments_campaign on public.campaign_assignments(campaign_id);
create index if not exists idx_campaign_assignments_user on public.campaign_assignments(user_id);

drop trigger if exists trg_campaign_assignments_updated_at on public.campaign_assignments;
create trigger trg_campaign_assignments_updated_at
before update on public.campaign_assignments
for each row execute function public.touch_updated_at();

alter table public.campaign_assignments enable row level security;

drop policy if exists campaign_assignments_super_admin_all on public.campaign_assignments;
create policy campaign_assignments_super_admin_all
on public.campaign_assignments
for all
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists campaign_assignments_member_read on public.campaign_assignments;
create policy campaign_assignments_member_read
on public.campaign_assignments
for select
using (public.is_super_admin() or public.is_org_member(organization_id));

