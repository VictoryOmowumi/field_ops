alter table public.visit_evidence
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid,
  add column if not exists delete_reason text;

create index if not exists idx_visit_evidence_org_deleted
  on public.visit_evidence(organization_id, deleted_at);
