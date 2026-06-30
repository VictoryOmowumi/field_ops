-- Eliminates admin/dashboard/summary's last two full-row fetches (a full
-- `sales` select used only to reduce/count in Node, and a full `visits`
-- select used only to build a JS Set of distinct agent_ids). Both scale with
-- row count regardless of date range — this campaign alone has ~39k visits,
-- and "filter back to campaign start" is the normal query shape, not an edge
-- case. Computing everything in Postgres removes that scaling entirely.
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
  total_sales_value numeric,
  active_agents bigint
)
language sql
stable
as $$
  with scoped_sales as (
    select s.id, s.agent_id, s.outlet_id, s.quantity, s.sales_value
    from public.sales s
    where s.organization_id = p_organization_id
      and (p_campaign_id is null or s.campaign_id = p_campaign_id)
      and (p_date_from is null or s.created_at >= p_date_from)
      and (p_date_to is null or s.created_at <= p_date_to)
  ),
  scoped_visit_agents as (
    select distinct v.agent_id
    from public.visits v
    where v.organization_id = p_organization_id
      and (p_campaign_id is null or v.campaign_id = p_campaign_id)
      and (p_date_from is null or v.created_at >= p_date_from)
      and (p_date_to is null or v.created_at <= p_date_to)
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
    (select coalesce(sum(coalesce(sales_value, 0)), 0) from scoped_sales),
    (select count(*) from combined_agents)
$$;
