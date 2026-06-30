-- Moves admin/dashboard/insights off a full visits+sales row fetch (computed
-- in Node) onto three grouped Postgres aggregates, same pattern as
-- visit_metrics_summary / campaign_visit_metrics. "Recent activity" itself
-- is paginated at the DB level (.range()) by the route, not by these RPCs.

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
      and (p_date_from is null or v.created_at >= p_date_from)
      and (p_date_to is null or v.created_at <= p_date_to)
  ),
  converted as (
    select distinct s.visit_id
    from public.sales s
    where s.organization_id = p_organization_id
      and (p_campaign_id is null or s.campaign_id = p_campaign_id)
      and (p_date_from is null or s.created_at >= p_date_from)
      and (p_date_to is null or s.created_at <= p_date_to)
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
      and (p_date_from is null or v.created_at >= p_date_from)
      and (p_date_to is null or v.created_at <= p_date_to)
      and v.latitude is not null
      and v.longitude is not null
  ),
  converted as (
    select distinct s.visit_id
    from public.sales s
    where s.organization_id = p_organization_id
      and (p_campaign_id is null or s.campaign_id = p_campaign_id)
      and (p_date_from is null or s.created_at >= p_date_from)
      and (p_date_to is null or s.created_at <= p_date_to)
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
      and (p_date_from is null or v.created_at >= p_date_from)
      and (p_date_to is null or v.created_at <= p_date_to)
      and v.agent_id is not null
  ),
  converted as (
    select distinct s.visit_id
    from public.sales s
    where s.organization_id = p_organization_id
      and (p_campaign_id is null or s.campaign_id = p_campaign_id)
      and (p_date_from is null or s.created_at >= p_date_from)
      and (p_date_to is null or s.created_at <= p_date_to)
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
