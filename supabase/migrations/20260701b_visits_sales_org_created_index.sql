-- visits/sales already have (organization_id, campaign_id, created_at desc)
-- (20260506_agent_visits_and_runtime_config.sql, 20260506_admin_outlets_sales_
-- and_reporting.sql). Every reporting/dashboard RPC treats p_campaign_id as
-- optional (`p_campaign_id is null or campaign_id = p_campaign_id`) -- for
-- "all campaigns" views, campaign_id sits between organization_id and
-- created_at in that index, so it can't be used for an efficient created_at
-- range scan. Add a dedicated (organization_id, created_at) index so
-- org-wide date-range queries stay index-bound as this org runs more
-- concurrent campaigns.
--
-- Plain (non-concurrent) build matches the existing convention in this
-- repo's migrations and is safe at current row counts (sub-second build,
-- brief lock). If these tables grow past roughly 500k-1M rows before this
-- runs, use `create index concurrently` outside a transaction block instead.

create index if not exists idx_visits_org_created
  on public.visits(organization_id, created_at desc);

create index if not exists idx_sales_org_created
  on public.sales(organization_id, created_at desc);
