-- Campaign deletion (DELETE /api/admin/campaigns/[id]) deletes visit_evidence rows directly, but
-- evidence_migration_items.visit_evidence_id was created with no ON DELETE behavior, defaulting
-- to NO ACTION -- blocking deletion of any campaign whose evidence was ever migrated (exactly
-- what happened deleting a test campaign after today's Phase 9 testing). The older, analogous
-- evidence_recompression_migration_log table already got this right with ON DELETE CASCADE; this
-- migration was an oversight by comparison. If the evidence row itself is being permanently
-- deleted, its per-item audit entry has nothing left to describe -- the job-level summary counts
-- on evidence_migration_jobs are untouched and remain the durable record either way.
alter table public.evidence_migration_items
  drop constraint if exists evidence_migration_items_visit_evidence_id_fkey;

alter table public.evidence_migration_items
  add constraint evidence_migration_items_visit_evidence_id_fkey
  foreign key (visit_evidence_id) references public.visit_evidence(id) on delete cascade;
