-- Phase 7: Cloudflare R2 (dual-provider). Additive metadata only — no existing file moves, no
-- upload defaults change. See docs/architecture/commercial-licensing-architecture.md §12 and
-- docs/architecture/commercial-implementation-roadmap.md Phase 7.

alter table public.visit_evidence
  add column if not exists storage_provider text not null default 'supabase'
    check (storage_provider in ('supabase', 'r2')),
  add column if not exists bucket text,
  add column if not exists object_key text,
  add column if not exists original_path text,
  add column if not exists archived_at timestamptz,
  add column if not exists archive_status text not null default 'hot'
    check (archive_status in ('hot', 'archiving', 'archived', 'restore_pending', 'restored')),
  add column if not exists checksum text,
  add column if not exists campaign_id uuid references public.campaigns(id);

-- campaign_id is denormalized from visits.campaign_id purely for migration-query performance in
-- Phase 9 (so the archival job can filter visit_evidence directly instead of joining through
-- visits every time). Backfilled once here; every new upload sets it going forward
-- (app/api/agent/visits/[id]/evidence/route.ts), so this UPDATE never needs to run again.
update public.visit_evidence ve
set campaign_id = v.campaign_id
from public.visits v
where v.id = ve.visit_id and ve.campaign_id is null;

create index if not exists idx_visit_evidence_campaign on public.visit_evidence(campaign_id);
create index if not exists idx_visit_evidence_storage_provider on public.visit_evidence(storage_provider);

-- Backfill bucket/object_key for existing rows so every row is self-describing, not just new
-- ones — object_key mirrors file_url (today's only location field); bucket is the hardcoded
-- name every upload has always used.
update public.visit_evidence
set bucket = 'evidence', object_key = file_url
where bucket is null;

-- This is NOT the archival mechanism. Active and completed-but-in-retention campaigns always
-- stay on Supabase regardless of this flag — that's a campaign-lifecycle fact (Phase 8), not a
-- new-upload choice. Archived campaigns' evidence moves to R2 via the Phase 9 migration job,
-- which flips storage_provider on already-existing rows after a verified copy; it never touches
-- this setting. This flag exists only so Phase 7 can prove the R2 provider works end-to-end
-- (upload -> signed URL -> gallery) via a one-off manual test. Expect it to sit on 'supabase'
-- permanently once that's done.
insert into public.platform_settings (key, value, section, label)
values
  ('default_storage_provider', 'supabase', 'Storage', 'Default storage provider for new evidence uploads')
on conflict (key) do nothing;
