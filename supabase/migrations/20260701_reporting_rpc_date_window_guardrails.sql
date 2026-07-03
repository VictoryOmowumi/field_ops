-- Defense-in-depth backstop for the reporting/dashboard RPCs' date params.
-- App-layer resolveDateWindow() (lib/server/query-window.ts) already
-- guarantees every current caller passes a bounded, non-null window --
-- that fix stands and is unchanged by this migration. This is purely a
-- SQL-level fallback for callers that bypass it (a future route that
-- forgets to call the helper, a script, or anything hitting these RPCs
-- directly): if either bound is null, fall back to a 400-day window
-- instead of an unbounded scan. This is the same class of incident that
-- took Postgres down on 2026-06-30 (see query-window.ts) -- this closes
-- the gap at the RPC layer itself rather than relying solely on every
-- caller remembering to bound their own queries.
--
-- Only the null-fallback predicates change; explicit caller-supplied
-- ranges (however wide) are left untouched, since capping those is a
-- product decision, not a scalability bug.

create or replace function public.visit_metrics_summary(
  p_organization_id uuid,
  p_campaign_id uuid default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null
)
returns table (
  total_visits bigint,
  unique_outlets bigint,
  unique_areas bigint,
  synced_visits bigint,
  posm_checks bigint,
  posm_deployed bigint,
  posm_units numeric,
  distributed_free_samples numeric
)
language sql
stable
as $$
  with scoped as (
    select id, outlet_id, state, lga, sync_status, task_payload
    from public.visits
    where organization_id = p_organization_id
      and (p_campaign_id is null or campaign_id = p_campaign_id)
      and created_at >= coalesce(p_date_from, now() - interval '400 days')
      and created_at <= coalesce(p_date_to, now())
  ),
  -- Guard the array extraction itself: jsonb_array_elements errors on a non-array input,
  -- so malformed/missing/non-array "activities" must be normalized to '[]' before iterating.
  activities as (
    select activity
    from scoped,
      jsonb_array_elements(
        case
          when jsonb_typeof(scoped.task_payload -> 'activities') = 'array'
            then scoped.task_payload -> 'activities'
          else '[]'::jsonb
        end
      ) as activity
  ),
  posm_activities as (
    select
      -- ->> on a missing/non-object path returns null, not an error; coalesce treats that as false
      -- rather than casting an arbitrary string to boolean.
      coalesce(lower(activity -> 'payload' ->> 'deployed') = 'true', false) as deployed,
      -- Only cast to numeric once the raw text matches a safe, bounded numeric pattern;
      -- anything else (blank, "abc", scientific notation, oversized strings) counts as 0.
      case
        when (activity -> 'payload' ->> 'quantity') ~ '^[0-9]{1,9}(\.[0-9]{1,4})?$'
          then (activity -> 'payload' ->> 'quantity')::numeric
        else 0
      end as quantity
    from activities
    where activity ->> 'activityId' = 'posm_deployment'
  ),
  free_sample_activities as (
    select
      coalesce(lower(activity -> 'payload' ->> 'given') = 'true', false) as given,
      case
        when (activity -> 'payload' ->> 'quantity') ~ '^[0-9]{1,9}(\.[0-9]{1,4})?$'
          then (activity -> 'payload' ->> 'quantity')::numeric
        else 0
      end as quantity
    from activities
    where activity ->> 'activityId' = 'free_sample_distribution'
  )
  select
    (select count(*) from scoped),
    (select count(distinct outlet_id) from scoped),
    (select count(distinct (state, lga)) filter (where state is not null or lga is not null) from scoped),
    (select count(*) filter (where sync_status = 'synced') from scoped),
    (select count(*) from posm_activities),
    (select count(*) from posm_activities where deployed),
    (select coalesce(sum(quantity), 0) from posm_activities where deployed and quantity > 0 and quantity <= 100),
    (select coalesce(sum(quantity), 0) from free_sample_activities where given and quantity > 0)
$$;

create or replace function public.dashboard_summary_extras(
  p_organization_id uuid,
  p_campaign_id uuid default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null
)
returns table (
  total_sales_records bigint,
  qualifying_sales_count bigint,
  units_sold numeric,
  distinct_converted_outlets bigint,
  distinct_converted_visits bigint,
  total_sales_value numeric,
  active_agents bigint
)
language sql
stable
as $$
  with scoped_sales as (
    select s.id, s.agent_id, s.outlet_id, s.visit_id, s.quantity, s.sales_value
    from public.sales s
    where s.organization_id = p_organization_id
      and (p_campaign_id is null or s.campaign_id = p_campaign_id)
      and s.created_at >= coalesce(p_date_from, now() - interval '400 days')
      and s.created_at <= coalesce(p_date_to, now())
  ),
  scoped_visit_agents as (
    select distinct v.agent_id
    from public.visits v
    where v.organization_id = p_organization_id
      and (p_campaign_id is null or v.campaign_id = p_campaign_id)
      and v.created_at >= coalesce(p_date_from, now() - interval '400 days')
      and v.created_at <= coalesce(p_date_to, now())
      and v.agent_id is not null
  ),
  combined_agents as (
    select agent_id from scoped_visit_agents
    union
    select agent_id from scoped_sales where agent_id is not null
  )
  select
    (select count(*) from scoped_sales),
    (select count(*) from scoped_sales where coalesce(quantity, 0) > 0 or coalesce(sales_value, 0) > 0),
    (select coalesce(sum(quantity), 0) from scoped_sales where coalesce(quantity, 0) > 0),
    (select count(distinct outlet_id) from scoped_sales
       where (coalesce(quantity, 0) > 0 or coalesce(sales_value, 0) > 0) and outlet_id is not null),
    (select count(distinct visit_id) from scoped_sales
       where (coalesce(quantity, 0) > 0 or coalesce(sales_value, 0) > 0) and visit_id is not null),
    (select coalesce(sum(coalesce(sales_value, 0)), 0) from scoped_sales),
    (select count(*) from combined_agents)
$$;

create or replace function public.dashboard_trend(
  p_organization_id uuid,
  p_campaign_id uuid default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null
)
returns table (day date, visits bigint, conversions bigint)
language sql
stable
as $$
  with scoped as (
    select v.id, v.created_at
    from public.visits v
    where v.organization_id = p_organization_id
      and (p_campaign_id is null or v.campaign_id = p_campaign_id)
      and v.created_at >= coalesce(p_date_from, now() - interval '400 days')
      and v.created_at <= coalesce(p_date_to, now())
  ),
  converted as (
    select distinct s.visit_id
    from public.sales s
    where s.organization_id = p_organization_id
      and (p_campaign_id is null or s.campaign_id = p_campaign_id)
      and s.created_at >= coalesce(p_date_from, now() - interval '400 days')
      and s.created_at <= coalesce(p_date_to, now())
      and (coalesce(s.quantity, 0) > 0 or coalesce(s.sales_value, 0) > 0)
      and s.visit_id is not null
  )
  select
    (scoped.created_at at time zone 'UTC')::date as day,
    count(*) as visits,
    count(*) filter (where converted.visit_id is not null) as conversions
  from scoped
  left join converted on converted.visit_id = scoped.id
  group by day
  order by day
$$;

create or replace function public.dashboard_territory_performance(
  p_organization_id uuid,
  p_campaign_id uuid default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null
)
returns table (
  state text,
  lga text,
  visits bigint,
  conversions bigint,
  avg_latitude double precision,
  avg_longitude double precision
)
language sql
stable
as $$
  with scoped as (
    select v.id, v.state, v.lga, v.latitude, v.longitude
    from public.visits v
    where v.organization_id = p_organization_id
      and (p_campaign_id is null or v.campaign_id = p_campaign_id)
      and v.created_at >= coalesce(p_date_from, now() - interval '400 days')
      and v.created_at <= coalesce(p_date_to, now())
      and v.latitude is not null
      and v.longitude is not null
  ),
  converted as (
    select distinct s.visit_id
    from public.sales s
    where s.organization_id = p_organization_id
      and (p_campaign_id is null or s.campaign_id = p_campaign_id)
      and s.created_at >= coalesce(p_date_from, now() - interval '400 days')
      and s.created_at <= coalesce(p_date_to, now())
      and (coalesce(s.quantity, 0) > 0 or coalesce(s.sales_value, 0) > 0)
      and s.visit_id is not null
  )
  select
    coalesce(nullif(trim(scoped.state), ''), 'Unknown State') as state,
    coalesce(nullif(trim(scoped.lga), ''), 'Unknown LGA') as lga,
    count(*) as visits,
    count(*) filter (where converted.visit_id is not null) as conversions,
    avg(scoped.latitude) as avg_latitude,
    avg(scoped.longitude) as avg_longitude
  from scoped
  left join converted on converted.visit_id = scoped.id
  group by 1, 2
  order by visits desc
  limit 100
$$;

create or replace function public.dashboard_rep_performance(
  p_organization_id uuid,
  p_campaign_id uuid default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_limit integer default 5
)
returns table (agent_id uuid, visits bigint, conversions bigint)
language sql
stable
as $$
  with scoped as (
    select v.id, v.agent_id
    from public.visits v
    where v.organization_id = p_organization_id
      and (p_campaign_id is null or v.campaign_id = p_campaign_id)
      and v.created_at >= coalesce(p_date_from, now() - interval '400 days')
      and v.created_at <= coalesce(p_date_to, now())
      and v.agent_id is not null
  ),
  converted as (
    select distinct s.visit_id
    from public.sales s
    where s.organization_id = p_organization_id
      and (p_campaign_id is null or s.campaign_id = p_campaign_id)
      and s.created_at >= coalesce(p_date_from, now() - interval '400 days')
      and s.created_at <= coalesce(p_date_to, now())
      and (coalesce(s.quantity, 0) > 0 or coalesce(s.sales_value, 0) > 0)
      and s.visit_id is not null
  )
  select
    scoped.agent_id,
    count(*) as visits,
    count(*) filter (where converted.visit_id is not null) as conversions
  from scoped
  left join converted on converted.visit_id = scoped.id
  group by scoped.agent_id
  order by visits desc
  limit p_limit
$$;

create or replace function public.reports_rep_performance(
  p_organization_id uuid,
  p_campaign_id uuid default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null
)
returns table (agent_id uuid, visits bigint, conversions bigint, sales_value numeric)
language sql
stable
as $$
  with scoped_visits as (
    select v.id, v.agent_id
    from public.visits v
    where v.organization_id = p_organization_id
      and (p_campaign_id is null or v.campaign_id = p_campaign_id)
      and v.created_at >= coalesce(p_date_from, now() - interval '400 days')
      and v.created_at <= coalesce(p_date_to, now())
      and v.agent_id is not null
  ),
  scoped_sales as (
    select s.agent_id, s.visit_id, s.quantity, s.sales_value
    from public.sales s
    where s.organization_id = p_organization_id
      and (p_campaign_id is null or s.campaign_id = p_campaign_id)
      and s.created_at >= coalesce(p_date_from, now() - interval '400 days')
      and s.created_at <= coalesce(p_date_to, now())
  ),
  converted as (
    select distinct visit_id
    from scoped_sales
    where visit_id is not null and (coalesce(quantity, 0) > 0 or coalesce(sales_value, 0) > 0)
  ),
  visit_agg as (
    select
      sv.agent_id,
      count(*) as visits,
      count(*) filter (where c.visit_id is not null) as conversions
    from scoped_visits sv
    left join converted c on c.visit_id = sv.id
    group by sv.agent_id
  ),
  sales_agg as (
    select agent_id, coalesce(sum(coalesce(sales_value, 0)), 0) as sales_value
    from scoped_sales
    where agent_id is not null
    group by agent_id
  )
  select
    coalesce(v.agent_id, s.agent_id) as agent_id,
    coalesce(v.visits, 0) as visits,
    coalesce(v.conversions, 0) as conversions,
    coalesce(s.sales_value, 0) as sales_value
  from visit_agg v
  full outer join sales_agg s on s.agent_id = v.agent_id
$$;

create or replace function public.reports_product_performance(
  p_organization_id uuid,
  p_campaign_id uuid default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null
)
returns table (product_name text, total_quantity numeric)
language sql
stable
as $$
  select
    coalesce(nullif(s.product_name, ''), 'Unknown') as product_name,
    coalesce(sum(coalesce(s.quantity, 0)), 0) as total_quantity
  from public.sales s
  where s.organization_id = p_organization_id
    and (p_campaign_id is null or s.campaign_id = p_campaign_id)
    and s.created_at >= coalesce(p_date_from, now() - interval '400 days')
    and s.created_at <= coalesce(p_date_to, now())
  group by 1
  order by total_quantity desc
$$;

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
      and v.created_at >= coalesce(p_date_from, now() - interval '400 days')
      and v.created_at <= coalesce(p_date_to, now())
  ),
  -- A sale only counts toward a bucket's conversions if its visit is itself
  -- in scope — matches the original logic of dropping sales whose visit_id
  -- doesn't resolve to a fetched visit.
  scoped_sales as (
    select s.visit_id, s.outlet_id, s.sales_value
    from public.sales s
    where s.organization_id = p_organization_id
      and (p_campaign_id is null or s.campaign_id = p_campaign_id)
      and s.created_at >= coalesce(p_date_from, now() - interval '400 days')
      and s.created_at <= coalesce(p_date_to, now())
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
