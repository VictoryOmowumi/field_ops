-- Migrate campaign supervisor source of truth to campaign_assignments (role=supervisor)

insert into public.campaign_assignments (organization_id, campaign_id, user_id, role, status)
select
  c.organization_id,
  c.id,
  c.assigned_supervisor_user_id,
  'supervisor',
  'active'
from public.campaigns c
where c.assigned_supervisor_user_id is not null
on conflict (campaign_id, user_id, role) do nothing;

