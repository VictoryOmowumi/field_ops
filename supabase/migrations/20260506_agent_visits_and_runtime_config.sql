-- Agent visit workflow + runtime form config extensions

alter table public.campaigns
  add column if not exists runtime_form_config jsonb not null default '{}'::jsonb;

create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  agent_id uuid not null references auth.users(id) on delete cascade,
  outcome text not null check (outcome in ('registered_only', 'converted', 'no_sale', 'pending', 'revisit')),
  no_sale_reason text,
  follow_up_date date,
  notes text,
  latitude double precision,
  longitude double precision,
  location_accuracy double precision,
  started_at timestamptz not null default now(),
  completed_at timestamptz not null default now(),
  sync_status text not null default 'synced' check (sync_status in ('pending', 'synced', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_visits_org_campaign_created
  on public.visits(organization_id, campaign_id, created_at desc);
create index if not exists idx_visits_org_agent_created
  on public.visits(organization_id, agent_id, created_at desc);

drop trigger if exists trg_visits_updated_at on public.visits;
create trigger trg_visits_updated_at
before update on public.visits
for each row execute function public.touch_updated_at();

alter table public.visits enable row level security;

drop policy if exists visits_super_admin_all on public.visits;
create policy visits_super_admin_all
on public.visits
for all
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists visits_member_read on public.visits;
create policy visits_member_read
on public.visits
for select
using (public.is_super_admin() or public.is_org_member(organization_id));

alter table public.sales
  add column if not exists visit_id uuid references public.visits(id) on delete set null;

create index if not exists idx_sales_visit_id on public.sales(visit_id);

