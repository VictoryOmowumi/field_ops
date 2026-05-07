-- Campaign task model + visit locality fields

alter table public.campaigns
  add column if not exists campaign_tasks text[] not null default '{}'::text[];

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'campaigns_campaign_tasks_allowed'
  ) then
    alter table public.campaigns
      add constraint campaigns_campaign_tasks_allowed
      check (
        campaign_tasks <@ array[
          'register_outlet',
          'revisit_outlet',
          'sell_to_outlet',
          'product_survey',
          'availability_survey',
          'price_survey'
        ]::text[]
      );
  end if;
end
$$;

alter table public.visits
  add column if not exists task_type text,
  add column if not exists state text,
  add column if not exists lga text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'visits_task_type_allowed'
  ) then
    alter table public.visits
      add constraint visits_task_type_allowed
      check (
        task_type is null or task_type in (
          'register_outlet',
          'revisit_outlet',
          'sell_to_outlet',
          'product_survey',
          'availability_survey',
          'price_survey'
        )
      );
  end if;
end
$$;

create index if not exists idx_visits_org_state_lga
  on public.visits(organization_id, state, lga, created_at desc);

