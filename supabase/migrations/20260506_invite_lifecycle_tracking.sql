-- Invite lifecycle tracking for organization users

alter table public.organization_users
  add column if not exists invite_sent_at timestamptz,
  add column if not exists accepted_at timestamptz;

