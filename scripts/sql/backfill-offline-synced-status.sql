-- Backfill for records that came in through the offline sync queue (POST /api/agent/sync/batch).
--
-- The client queued visits and outlets with sync_status = 'pending' and visits with
-- outcome = 'pending', and the batch endpoint copied those values straight into the database.
-- Every one of these rows is on the server, so it has synced; the outcome is re-derived from
-- visit_outcome_code using the same mapping as lib/workflow.ts mapWorkflowOutcomeToVisitOutcome.
-- The endpoint is now fixed, so no new rows get stuck.
--
-- This is a manual script, not a migration. Run it in the SQL editor.
--
-- HOW TO USE
--   1. Set target_campaign in STEP 1: a campaign id to fix one campaign, or null for all.
--   2. Run the PREVIEW section on its own and check the counts.
--   3. Run the BACKFILL section (the DO block is atomic; any failure changes nothing).
--   4. To undo, run the ROLLBACK section at the bottom (select it and run it as one block).
--
-- Safe to run more than once: e.g. one campaign first, then again with null for the rest.
-- Every changed row's old values are saved in public.backfill_20261109_sync_status first, and
-- the updates only touch rows that are in that backup table.


-- ============================================================================================
-- PREVIEW (read-only). Replace the campaign id, or drop the campaign_id filters for all.
-- ============================================================================================
-- select count(*) as pending_visits from public.visits
-- where sync_status = 'pending' and campaign_id = '785afc12-12bc-4921-ae60-4240e1713f25';
--
-- select count(*) as pending_outlets from public.outlets
-- where sync_status = 'pending' and campaign_id = '785afc12-12bc-4921-ae60-4240e1713f25';
--
-- select visit_outcome_code, count(*) from public.visits
-- where outcome = 'pending' and visit_outcome_code is not null
--   and campaign_id = '785afc12-12bc-4921-ae60-4240e1713f25'
-- group by 1;


-- ============================================================================================
-- BACKFILL
-- Runs as a single DO block, so it is all-or-nothing even in editors that autocommit each
-- statement (like the Supabase SQL editor).
-- ============================================================================================

-- Backup table. RLS is on with no policies, so it is not readable through the public API.
create table if not exists public.backfill_20261109_sync_status (
  table_name text not null check (table_name in ('visits', 'outlets')),
  row_id uuid not null,
  campaign_id uuid,
  old_sync_status text,
  old_outcome text,
  backed_up_at timestamptz not null default now(),
  primary key (table_name, row_id)
);
alter table public.backfill_20261109_sync_status enable row level security;

do $$
declare
  -- STEP 1: scope. A campaign id fixes one campaign; set to null to fix every campaign.
  target_campaign uuid := '785afc12-12bc-4921-ae60-4240e1713f25';
  n integer;
begin
  -- STEP 2: back up every row that is about to change.
  insert into public.backfill_20261109_sync_status (table_name, row_id, campaign_id, old_sync_status, old_outcome)
  select 'visits', v.id, v.campaign_id, v.sync_status, v.outcome
  from public.visits v
  where (target_campaign is null or v.campaign_id = target_campaign)
    and (v.sync_status = 'pending' or (v.outcome = 'pending' and v.visit_outcome_code is not null))
  on conflict (table_name, row_id) do nothing;
  get diagnostics n = row_count;
  raise notice 'visits backed up: %', n;

  insert into public.backfill_20261109_sync_status (table_name, row_id, campaign_id, old_sync_status, old_outcome)
  select 'outlets', o.id, o.campaign_id, o.sync_status, null
  from public.outlets o
  where (target_campaign is null or o.campaign_id = target_campaign)
    and o.sync_status = 'pending'
  on conflict (table_name, row_id) do nothing;
  get diagnostics n = row_count;
  raise notice 'outlets backed up: %', n;

  -- STEP 3: update only rows that are in the backup table (and in scope).
  update public.visits v
  set sync_status = 'synced'
  from public.backfill_20261109_sync_status b
  where b.table_name = 'visits' and b.row_id = v.id
    and (target_campaign is null or b.campaign_id = target_campaign)
    and v.sync_status = 'pending';
  get diagnostics n = row_count;
  raise notice 'visits sync_status fixed: %', n;

  update public.visits v
  set outcome = case v.visit_outcome_code
      when 'products_sold' then 'converted'
      when 'outlet_closed' then 'revisit'
      else 'no_sale'
    end
  from public.backfill_20261109_sync_status b
  where b.table_name = 'visits' and b.row_id = v.id
    and (target_campaign is null or b.campaign_id = target_campaign)
    and v.outcome = 'pending'
    and v.visit_outcome_code is not null;
  get diagnostics n = row_count;
  raise notice 'visits outcome fixed: %', n;

  update public.outlets o
  set sync_status = 'synced'
  from public.backfill_20261109_sync_status b
  where b.table_name = 'outlets' and b.row_id = o.id
    and (target_campaign is null or b.campaign_id = target_campaign)
    and o.sync_status = 'pending';
  get diagnostics n = row_count;
  raise notice 'outlets sync_status fixed: %', n;
end $$;

-- Check afterwards:
-- select table_name, count(*) from public.backfill_20261109_sync_status group by 1;


-- ============================================================================================
-- ROLLBACK (only if needed). Restores old values for every backed-up row. Add
-- "and b.campaign_id = '...'" to both updates to roll back a single campaign.
-- ============================================================================================
-- do $$
-- begin
--   update public.visits v
--   set sync_status = b.old_sync_status, outcome = b.old_outcome
--   from public.backfill_20261109_sync_status b
--   where b.table_name = 'visits' and b.row_id = v.id;
--
--   update public.outlets o
--   set sync_status = b.old_sync_status
--   from public.backfill_20261109_sync_status b
--   where b.table_name = 'outlets' and b.row_id = o.id;
-- end $$;
--
-- Once you're happy with the result, the backup table can be dropped:
-- drop table public.backfill_20261109_sync_status;
