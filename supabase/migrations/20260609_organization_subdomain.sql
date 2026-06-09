-- Add subdomain field to organizations for tenant hostname routing
-- e.g., iminndx.activationiq.org → subdomain = 'iminndx'
-- Later supports custom domains: portal.clientdomain.com → domain column

alter table public.organizations
  add column if not exists subdomain text unique;

create index if not exists idx_organizations_subdomain on public.organizations(subdomain)
  where subdomain is not null;
