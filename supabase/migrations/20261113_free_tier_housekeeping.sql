-- Free-tier housekeeping. Applying this migration ONLY creates two functions. It deletes nothing
-- and schedules nothing. Rows are deleted only when someone explicitly calls a function.
--
-- Read-only previews (run these first):
--
--   select pg_size_pretty(pg_total_relation_size('public.system_events')) as system_events_size;
--
--   select count(*) as prune_system_events_would_delete
--   from public.system_events
--   where created_at < now() - interval '90 days'
--      or (event_type in ('performance_metric', 'login_succeeded')
--          and severity = 'info'
--          and created_at < now() - interval '7 days');
--
--   select count(*) as noop_jobs_would_delete
--   from public.evidence_migration_jobs
--   where status = 'completed' and candidate_count = 0 and migrated_count = 0
--     and failed_count = 0 and completed_at < now() - interval '7 days';
--
--   select count(*) as noop_audit_rows_would_delete
--   from public.platform_audit_logs
--   where target_type = 'evidence_migration_job'
--     and action in ('evidence_migration.run', 'evidence_migration.dry_run')
--     and after_state->>'candidateCount' = '0'
--     and created_at < now() - interval '7 days';
--
-- Manual run (service role / SQL editor, after taking and testing a backup):
--
--   select public.prune_system_events();
--   select public.prune_noop_migration_records();
--
-- DELETE does not return disk space to the plan quota. After the first large prune, run this ONCE
-- in a quiet period. It takes an exclusive lock on system_events while it rewrites the table, so
-- event inserts wait briefly, and it needs enough free disk for a temporary copy of the live rows:
--
--   vacuum full public.system_events;

create or replace function public.prune_system_events(
  noisy_retention_days int default 7,
  default_retention_days int default 90
)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  deleted_count int;
begin
  if noisy_retention_days is null or noisy_retention_days < 1
     or default_retention_days is null or default_retention_days < 1 then
    raise exception 'Retention windows must be at least 1 day.';
  end if;

  delete from public.system_events
  where created_at < now() - make_interval(days => default_retention_days)
     or (
       event_type in ('performance_metric', 'login_succeeded')
       and severity = 'info'
       and created_at < now() - make_interval(days => noisy_retention_days)
     );

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

create or replace function public.prune_noop_migration_records(
  retention_days int default 7
)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  deleted_jobs int;
  deleted_audit_rows int;
begin
  if retention_days is null or retention_days < 1 then
    raise exception 'Retention window must be at least 1 day.';
  end if;

  delete from public.evidence_migration_jobs
  where status = 'completed'
    and candidate_count = 0
    and migrated_count = 0
    and failed_count = 0
    and completed_at < now() - make_interval(days => retention_days);
  get diagnostics deleted_jobs = row_count;

  delete from public.platform_audit_logs
  where target_type = 'evidence_migration_job'
    and action in ('evidence_migration.run', 'evidence_migration.dry_run')
    and after_state->>'candidateCount' = '0'
    and created_at < now() - make_interval(days => retention_days);
  get diagnostics deleted_audit_rows = row_count;

  return deleted_jobs + deleted_audit_rows;
end;
$$;

revoke execute on function public.prune_system_events(int, int) from public, anon, authenticated;
revoke execute on function public.prune_noop_migration_records(int) from public, anon, authenticated;
grant execute on function public.prune_system_events(int, int) to service_role;
grant execute on function public.prune_noop_migration_records(int) to service_role;

-- Optional schedule. Deliberately commented out so applying this migration never starts deleting
-- on its own. Enable pg_cron and run these by hand only after reviewing the previews above.
--
-- select cron.schedule('prune-system-events', '40 3 * * *', $job$select public.prune_system_events()$job$);
-- select cron.schedule('prune-noop-migration-records', '50 3 * * 0', $job$select public.prune_noop_migration_records()$job$);
