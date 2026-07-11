-- Phase 9: Media Migration. An immutable manifest for the highest-blast-radius job in this whole
-- rollout — it's the only phase that moves real customer data. Formalizes the same pattern as
-- the existing evidence_recompression_migration_log one level further, since a job at this scale
-- needs its own auditable record rather than leaning solely on visit_evidence's status columns.

create table if not exists public.evidence_migration_jobs (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('dry_run', 'live')),
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  candidate_count integer not null default 0,
  migrated_count integer not null default 0,
  failed_count integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  triggered_by uuid references auth.users(id)
);

create table if not exists public.evidence_migration_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.evidence_migration_jobs(id) on delete cascade,
  visit_evidence_id uuid not null references public.visit_evidence(id),
  source_checksum text,
  dest_checksum text,
  status text not null default 'pending'
    check (status in ('pending', 'copied', 'verified', 'failed', 'rolled_back')),
  error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_evidence_migration_items_job on public.evidence_migration_items(job_id);
create index if not exists idx_evidence_migration_items_evidence on public.evidence_migration_items(visit_evidence_id);

alter table public.evidence_migration_jobs enable row level security;
alter table public.evidence_migration_items enable row level security;

drop policy if exists evidence_migration_jobs_super_admin_all on public.evidence_migration_jobs;
create policy evidence_migration_jobs_super_admin_all
on public.evidence_migration_jobs
for all
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists evidence_migration_items_super_admin_all on public.evidence_migration_items;
create policy evidence_migration_items_super_admin_all
on public.evidence_migration_items
for all
using (public.is_super_admin())
with check (public.is_super_admin());

-- This job only ever runs against archived campaigns' evidence (see lib/storage/media-migration.ts),
-- which is why the Phase 8 campaign_id denormalization on visit_evidence (Phase 7 migration)
-- matters: the candidate query filters visit_evidence directly by joining campaigns on that
-- column, not through visits every time.
