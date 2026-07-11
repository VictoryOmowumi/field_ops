-- Grandfather every existing organization and campaign so nothing existing is ever
-- retroactively blocked once the commercial gate ships (Phase 5, not part of this migration).
-- See docs/architecture/commercial-implementation-roadmap.md, Phase 1 + Migration strategy.

insert into public.billing_accounts (organization_id, account_status, implementation_fee_status, billing_contact_email)
select
  o.id,
  'in_good_standing',
  'paid',
  coalesce(o.billing_email, o.primary_contact_email)
from public.organizations o
where not exists (
  select 1 from public.billing_accounts ba where ba.organization_id = o.id
);

-- activation_status reflects what the campaign actually did, not a single blanket value:
--   already ran (active/completed/archived) -> 'active'   — it consumed its approval
--   cancelled                                -> 'expired'  — the opportunity to launch it
--                                                             is gone, it's not "approved
--                                                             and still launchable"
--   draft                                    -> 'approved' — cleared, launchable whenever
-- Avoids the confusing "Campaign Status: Archived / Activation Status: Approved" reading a
-- single hardcoded value would produce.
insert into public.campaign_activations (campaign_id, billing_account_id, activation_status)
select
  c.id,
  ba.id,
  case
    when c.status in ('active', 'completed', 'archived') then 'active'
    when c.status = 'cancelled' then 'expired'
    else 'approved'
  end
from public.campaigns c
join public.billing_accounts ba on ba.organization_id = c.organization_id
where not exists (
  select 1 from public.campaign_activations ca where ca.campaign_id = c.id
);

insert into public.campaign_activation_history (campaign_activation_id, from_status, to_status, reason)
select
  ca.id,
  null,
  ca.activation_status,
  'grandfathered — pre-commercial-launch'
from public.campaign_activations ca
where not exists (
  select 1 from public.campaign_activation_history h where h.campaign_activation_id = ca.id
);

-- Deployment sanity check — run after applying, counts on each side should match:
--   select count(*) from public.organizations; select count(*) from public.billing_accounts;
--   select count(*) from public.campaigns; select count(*) from public.campaign_activations;
