create table if not exists public.offline_recovery_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  idempotency_key text not null,
  entity_type text not null,
  status text not null,
  error_message text,
  has_outlet_details boolean not null default false,
  has_evidence_blob boolean not null default false,
  metadata jsonb,
  first_reported_at timestamptz not null default now(),
  last_reported_at timestamptz not null default now()
);

-- One row per stuck record per agent; re-reports on later app opens refresh
-- status/error/last_reported_at instead of accumulating duplicates.
create unique index if not exists offline_recovery_reports_unique_idx
  on public.offline_recovery_reports (user_id, idempotency_key, entity_type);

create index if not exists offline_recovery_reports_org_idx on public.offline_recovery_reports (organization_id);
create index if not exists offline_recovery_reports_campaign_idx on public.offline_recovery_reports (campaign_id);
create index if not exists offline_recovery_reports_status_idx on public.offline_recovery_reports (status);
create index if not exists offline_recovery_reports_last_reported_idx
  on public.offline_recovery_reports (last_reported_at desc);
