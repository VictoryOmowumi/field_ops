-- Persist task-specific facts for agent visits

alter table public.visits
  add column if not exists task_payload jsonb not null default '{}'::jsonb;

