-- admin/campaigns list needs all-time per-campaign totals (not a date-bounded
-- window), so the fix here is aggregating in Postgres instead of transferring
-- every visit/sale row for every campaign on every list-page load.
create or replace function public.campaign_visit_metrics(
  p_organization_id uuid,
  p_campaign_ids uuid[]
)
returns table (
  campaign_id uuid,
  visits_count bigint,
  achieved_visits bigint,
  conversions bigint,
  last_visit_at timestamptz,
  last_sale_at timestamptz
)
language sql
stable
as $$
  with visit_agg as (
    select
      v.campaign_id,
      count(*) as visits_count,
      count(distinct v.outlet_id) as achieved_visits,
      max(v.created_at) as last_visit_at
    from public.visits v
    where v.organization_id = p_organization_id
      and v.campaign_id = any(p_campaign_ids)
    group by v.campaign_id
  ),
  sale_agg as (
    select
      s.campaign_id,
      count(distinct s.outlet_id) filter (
        where coalesce(s.quantity, 0) > 0 or coalesce(s.sales_value, 0) > 0
      ) as conversions,
      max(s.created_at) as last_sale_at
    from public.sales s
    where s.organization_id = p_organization_id
      and s.campaign_id = any(p_campaign_ids)
    group by s.campaign_id
  )
  select
    coalesce(v.campaign_id, s.campaign_id) as campaign_id,
    coalesce(v.visits_count, 0) as visits_count,
    coalesce(v.achieved_visits, 0) as achieved_visits,
    coalesce(s.conversions, 0) as conversions,
    v.last_visit_at,
    s.last_sale_at
  from visit_agg v
  full outer join sale_agg s on s.campaign_id = v.campaign_id
$$;
