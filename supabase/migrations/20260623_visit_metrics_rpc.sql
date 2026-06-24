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
  synced_visits bigint
)
language sql
stable
as $$
  select
    count(*) as total_visits,
    count(distinct outlet_id) as unique_outlets,
    count(distinct (state, lga)) filter (where state is not null or lga is not null) as unique_areas,
    count(*) filter (where sync_status = 'synced') as synced_visits
  from public.visits
  where organization_id = p_organization_id
    and (p_campaign_id is null or campaign_id = p_campaign_id)
    and (p_date_from is null or created_at >= p_date_from)
    and (p_date_to is null or created_at <= p_date_to)
$$;
