-- Campaign share links for external read-only campaign monitoring

create table if not exists public.campaign_share_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  created_by_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_email text,
  token_hash text not null,
  status text not null default 'active' check (status in ('active', 'revoked', 'expired')),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_viewed_at timestamptz,
  view_count integer not null default 0 check (view_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_campaign_share_links_token_hash
  on public.campaign_share_links(token_hash);
create index if not exists idx_campaign_share_links_org_campaign
  on public.campaign_share_links(organization_id, campaign_id, created_at desc);
create index if not exists idx_campaign_share_links_status_expires
  on public.campaign_share_links(status, expires_at);

drop trigger if exists trg_campaign_share_links_updated_at on public.campaign_share_links;
create trigger trg_campaign_share_links_updated_at
before update on public.campaign_share_links
for each row execute function public.touch_updated_at();

create table if not exists public.campaign_share_views (
  id uuid primary key default gen_random_uuid(),
  share_link_id uuid not null references public.campaign_share_links(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  ip_hash text,
  user_agent text,
  referrer text
);

create index if not exists idx_campaign_share_views_link_viewed_at
  on public.campaign_share_views(share_link_id, viewed_at desc);

alter table public.campaign_share_links enable row level security;
alter table public.campaign_share_views enable row level security;

drop policy if exists campaign_share_links_super_admin_all on public.campaign_share_links;
create policy campaign_share_links_super_admin_all
on public.campaign_share_links
for all
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists campaign_share_links_member_read on public.campaign_share_links;
create policy campaign_share_links_member_read
on public.campaign_share_links
for select
using (public.is_super_admin() or public.is_org_member(organization_id));

drop policy if exists campaign_share_views_super_admin_all on public.campaign_share_views;
create policy campaign_share_views_super_admin_all
on public.campaign_share_views
for all
using (
  public.is_super_admin()
  or exists (
    select 1
    from public.campaign_share_links csl
    where csl.id = campaign_share_views.share_link_id
      and public.is_org_member(csl.organization_id)
  )
)
with check (
  public.is_super_admin()
  or exists (
    select 1
    from public.campaign_share_links csl
    where csl.id = campaign_share_views.share_link_id
      and public.is_org_member(csl.organization_id)
  )
);

