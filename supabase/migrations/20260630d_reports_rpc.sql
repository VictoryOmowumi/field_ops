-- Moves the admin Reports page off raw visits/sales row fetches for every
-- aggregate it shows (overview KPIs, trend, product performance, rep
-- performance) onto grouped Postgres aggregates, same pattern as the
-- dashboard RPCs. campaign-activities export stays row-level on purpose —
-- it's a genuine per-visit activity breakdown, not summarizable.

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
      and (p_date_from is null or v.created_at >= p_date_from)
      and (p_date_to is null or v.created_at <= p_date_to)
      and v.agent_id is not null
  ),
  scoped_sales as (
    select s.agent_id, s.visit_id, s.quantity, s.sales_value
    from public.sales s
    where s.organization_id = p_organization_id
      and (p_campaign_id is null or s.campaign_id = p_campaign_id)
      and (p_date_from is null or s.created_at >= p_date_from)
      and (p_date_to is null or s.created_at <= p_date_to)
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
    and (p_date_from is null or s.created_at >= p_date_from)
    and (p_date_to is null or s.created_at <= p_date_to)
  group by 1
  order by total_quantity desc
$$;
