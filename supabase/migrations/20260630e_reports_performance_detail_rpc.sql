-- Moves admin/reports/performance (and its CSV export) off the most
-- dangerous query left in the app: an unbounded `visits` fetch (no date
-- fallback at all) that pulled task_payload for every row and did a
-- hierarchical date/area/agent aggregation in Node. Computes the same
-- per-(date, area, agent) bucket entirely in Postgres. Boolean/numeric
-- values extracted from task_payload use the same safe-parsing pattern as
-- visit_metrics_summary (no unsafe ::boolean/::numeric casts on untrusted
-- jsonb-derived text).
create or replace function public.reports_performance_detail(
  p_organization_id uuid,
  p_campaign_id uuid default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null
)
returns table (
  visit_date date,
  area text,
  agent_id uuid,
  achieved_visits bigint,
  achieved_conversions bigint,
  achieved_sales_value numeric,
  achieved_samples numeric,
  posm_deployed_outlets bigint
)
language sql
stable
as $$
  with scoped_visits as (
    select
      v.id,
      (v.created_at at time zone 'UTC')::date as visit_date,
      coalesce(nullif(trim(v.lga), ''), 'Unknown Area') as area,
      v.agent_id,
      v.outlet_id,
      v.task_payload
    from public.visits v
    where v.organization_id = p_organization_id
      and (p_campaign_id is null or v.campaign_id = p_campaign_id)
      and (p_date_from is null or v.created_at >= p_date_from)
      and (p_date_to is null or v.created_at <= p_date_to)
  ),
  -- A sale only counts toward a bucket's conversions if its visit is itself
  -- in scope — matches the original logic of dropping sales whose visit_id
  -- doesn't resolve to a fetched visit.
  scoped_sales as (
    select s.visit_id, s.outlet_id, s.sales_value
    from public.sales s
    where s.organization_id = p_organization_id
      and (p_campaign_id is null or s.campaign_id = p_campaign_id)
      and (p_date_from is null or s.created_at >= p_date_from)
      and (p_date_to is null or s.created_at <= p_date_to)
      and (coalesce(s.quantity, 0) > 0 or coalesce(s.sales_value, 0) > 0)
  ),
  -- One row per (visit, activity); guards the array extraction the same way
  -- visit_metrics_summary does — malformed/missing/non-array "activities"
  -- normalizes to an empty array instead of erroring.
  visit_activities as (
    select
      sv.visit_date,
      sv.area,
      sv.agent_id,
      sv.outlet_id,
      activity
    from scoped_visits sv,
      jsonb_array_elements(
        case
          when jsonb_typeof(sv.task_payload -> 'activities') = 'array'
            then sv.task_payload -> 'activities'
          else '[]'::jsonb
        end
      ) as activity
  ),
  visit_bucket as (
    select visit_date, area, agent_id, count(distinct outlet_id) as achieved_visits
    from scoped_visits
    group by visit_date, area, agent_id
  ),
  conversion_bucket as (
    select
      sv.visit_date,
      sv.area,
      sv.agent_id,
      count(distinct ss.outlet_id) as achieved_conversions,
      coalesce(sum(ss.sales_value), 0) as achieved_sales_value
    from scoped_visits sv
    join scoped_sales ss on ss.visit_id = sv.id
    group by sv.visit_date, sv.area, sv.agent_id
  ),
  sample_bucket as (
    select
      visit_date,
      area,
      agent_id,
      coalesce(sum(
        case
          when coalesce(lower(activity -> 'payload' ->> 'given') = 'true', false)
            and (activity -> 'payload' ->> 'quantity') ~ '^[0-9]{1,9}(\.[0-9]{1,4})?$'
          then (activity -> 'payload' ->> 'quantity')::numeric
          else 0
        end
      ), 0) as achieved_samples
    from visit_activities
    where activity ->> 'activityId' = 'free_sample_distribution'
    group by visit_date, area, agent_id
  ),
  posm_bucket as (
    select visit_date, area, agent_id, count(distinct outlet_id) as posm_deployed_outlets
    from visit_activities
    where activity ->> 'activityId' = 'posm_deployment'
      and coalesce(lower(activity -> 'payload' ->> 'deployed') = 'true', false)
      and outlet_id is not null
    group by visit_date, area, agent_id
  )
  select
    vb.visit_date,
    vb.area,
    vb.agent_id,
    vb.achieved_visits,
    coalesce(cb.achieved_conversions, 0),
    coalesce(cb.achieved_sales_value, 0),
    coalesce(sb.achieved_samples, 0),
    coalesce(pb.posm_deployed_outlets, 0)
  from visit_bucket vb
  left join conversion_bucket cb
    on cb.visit_date = vb.visit_date and cb.area = vb.area and cb.agent_id is not distinct from vb.agent_id
  left join sample_bucket sb
    on sb.visit_date = vb.visit_date and sb.area = vb.area and sb.agent_id is not distinct from vb.agent_id
  left join posm_bucket pb
    on pb.visit_date = vb.visit_date and pb.area = vb.area and pb.agent_id is not distinct from vb.agent_id
$$;
