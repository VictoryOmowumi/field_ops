-- Materialized per-campaign analytics summary. The dashboard/list/detail views for a
-- completed or archived campaign were re-running visit_metrics_summary/dashboard_summary_extras
-- (a live jsonb_array_elements unnest over every visit row) on every page load -- fine for a
-- small active campaign, but this is what produced the statement-timeout on a 26k-evidence
-- campaign. A completed campaign's numbers are final and don't change, so compute them once
-- (on the draft/active -> completed transition, see app/api/admin/campaigns/[id]/route.ts) and
-- read from this table afterward instead of re-scanning raw rows every time.

create table if not exists public.campaign_analytics_snapshots (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  total_submissions integer not null default 0,
  conversions integer not null default 0,
  converted_outlets integer not null default 0,
  sales_count integer not null default 0,
  units_sold numeric not null default 0,
  achieved_visits integer not null default 0,
  unique_outlets integer not null default 0,
  areas_covered integer not null default 0,
  conversion_rate numeric not null default 0,
  sync_health numeric not null default 0,
  posm_checks integer not null default 0,
  posm_deployed integer not null default 0,
  posm_units numeric not null default 0,
  posm_deployment_rate numeric not null default 0,
  planned_free_samples numeric not null default 0,
  distributed_free_samples numeric not null default 0,
  remaining_free_samples numeric not null default 0,
  free_sample_achievement_rate numeric not null default 0,
  computed_at timestamptz not null default now()
);

create index if not exists idx_campaign_analytics_snapshots_org
  on public.campaign_analytics_snapshots(organization_id);

alter table public.campaign_analytics_snapshots enable row level security;

drop policy if exists campaign_analytics_snapshots_super_admin_all on public.campaign_analytics_snapshots;
create policy campaign_analytics_snapshots_super_admin_all
on public.campaign_analytics_snapshots
for all
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists campaign_analytics_snapshots_member_read on public.campaign_analytics_snapshots;
create policy campaign_analytics_snapshots_member_read
on public.campaign_analytics_snapshots
for select
using (public.is_super_admin() or public.is_org_member(organization_id));
