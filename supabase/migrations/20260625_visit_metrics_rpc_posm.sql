drop function if exists public.visit_metrics_summary(uuid, uuid, timestamptz, timestamptz);

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
      and (p_date_from is null or created_at >= p_date_from)
      and (p_date_to is null or created_at <= p_date_to)
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
