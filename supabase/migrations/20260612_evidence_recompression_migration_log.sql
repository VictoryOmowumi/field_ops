-- Tracking table for the 2026-06 evidence photo recompression migration.
-- Additive only. Used by scripts/migrate-evidence-recompression.mjs and
-- scripts/verify-evidence-recompression.mjs to make the migration
-- idempotent, resumable, and auditable.

create table if not exists public.evidence_recompression_migrations (
  id uuid primary key default gen_random_uuid(),
  visit_evidence_id uuid not null references public.visit_evidence(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  batch_id text not null default '2026-06',
  original_path text not null,
  archive_path text,
  compressed_path text,
  original_size bigint,
  compressed_size bigint,
  reduction_percent numeric,
  original_mime_type text,
  original_file_url text,
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed', 'rolled_back')),
  error_message text,
  attempt_count integer not null default 0,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_evidence_recompression_unique_row
  on public.evidence_recompression_migrations(visit_evidence_id, batch_id);

create index if not exists idx_evidence_recompression_status
  on public.evidence_recompression_migrations(batch_id, status);

alter table public.evidence_recompression_migrations enable row level security;

drop policy if exists evidence_recompression_super_admin_all on public.evidence_recompression_migrations;
create policy evidence_recompression_super_admin_all
on public.evidence_recompression_migrations
for all
using (public.is_super_admin())
with check (public.is_super_admin());
