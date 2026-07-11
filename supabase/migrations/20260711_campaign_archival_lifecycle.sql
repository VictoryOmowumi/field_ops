-- Phase 8: Campaign Archival. Additive only — no existing campaign is touched by this migration
-- itself; the scheduler that reads these columns ships dark behind commercial.archive.enabled
-- (already inserted in Phase 1, defaulted 'false').

alter table public.campaigns
  add column if not exists completed_at timestamptz,
  add column if not exists archived_at timestamptz;

-- Best-effort backfill for existing completed campaigns: we don't know exactly when each one
-- actually completed historically, so updated_at is the closest available proxy. This only feeds
-- the retention countdown for pre-existing data — it does not retroactively archive anything.
update public.campaigns
set completed_at = updated_at
where status = 'completed' and completed_at is null;

create index if not exists idx_campaigns_completed_at on public.campaigns(completed_at);
create index if not exists idx_campaigns_status_completed_at on public.campaigns(status, completed_at);
