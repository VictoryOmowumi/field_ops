create table if not exists public.system_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  severity text not null check (severity in ('info', 'warning', 'error', 'critical')),
  message text not null,
  organization_id uuid null references public.organizations(id) on delete set null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists system_events_created_at_idx on public.system_events (created_at desc);
create index if not exists system_events_event_type_idx on public.system_events (event_type);
create index if not exists system_events_org_idx on public.system_events (organization_id);
