-- Workflow-first campaign model + visit metadata + outlet match RPC

alter table public.campaigns
  add column if not exists campaign_workflow_template text,
  add column if not exists campaign_workflow jsonb not null default '{}'::jsonb;

alter table public.visits
  add column if not exists visit_activity_path text[] not null default '{}',
  add column if not exists visit_outcome_code text,
  add column if not exists visit_outcome_label text;

create index if not exists idx_campaigns_workflow_template
  on public.campaigns(campaign_workflow_template);

create or replace function public.match_or_create_outlet(
  p_organization_id uuid,
  p_campaign_id uuid,
  p_created_by uuid,
  p_name text,
  p_outlet_type text default null,
  p_contact_person text default null,
  p_phone text default null,
  p_address text default null,
  p_state text default null,
  p_lga text default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_location_accuracy double precision default null,
  p_radius_meters integer default 250
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_outlet_id uuid;
begin
  select o.id
  into v_outlet_id
  from public.outlets o
  where o.organization_id = p_organization_id
    and (
      (p_phone is not null and p_phone <> '' and o.phone = p_phone)
      or lower(trim(o.name)) = lower(trim(coalesce(p_name, '')))
      or (
        p_latitude is not null and p_longitude is not null
        and o.latitude is not null and o.longitude is not null
        and (
          6371000 * acos(
            least(1, greatest(-1,
              cos(radians(p_latitude)) * cos(radians(o.latitude)) * cos(radians(o.longitude) - radians(p_longitude))
              + sin(radians(p_latitude)) * sin(radians(o.latitude))
            ))
          )
        ) <= p_radius_meters
      )
    )
  order by o.created_at desc
  limit 1;

  if v_outlet_id is not null then
    return v_outlet_id;
  end if;

  insert into public.outlets (
    organization_id,
    campaign_id,
    name,
    outlet_type,
    contact_person,
    phone,
    address,
    state,
    lga,
    latitude,
    longitude,
    location_accuracy,
    sync_status,
    created_by
  ) values (
    p_organization_id,
    p_campaign_id,
    coalesce(nullif(trim(p_name), ''), 'Unnamed Outlet'),
    p_outlet_type,
    p_contact_person,
    p_phone,
    p_address,
    p_state,
    p_lga,
    p_latitude,
    p_longitude,
    p_location_accuracy,
    'synced',
    p_created_by
  )
  returning id into v_outlet_id;

  return v_outlet_id;
end;
$$;

grant execute on function public.match_or_create_outlet(
  uuid, uuid, uuid, text, text, text, text, text, text, text, double precision, double precision, double precision, integer
) to authenticated;

