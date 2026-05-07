-- ActivationIQ role setup for three scenarios:
-- 1) agent
-- 2) admin (organization admin/client admin)
-- 3) super_admin (platform admin)

-- Safe helper to read role from JWT claim app_metadata.role.
create or replace function public.current_app_role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(auth.jwt() -> 'app_metadata' ->> 'role', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'role', '')
  );
$$;

-- Role check helper for RLS policies.
create or replace function public.has_app_role(required_role text)
returns boolean
language sql
stable
as $$
  select public.current_app_role() = required_role;
$$;

-- Any privileged back-office user.
create or replace function public.is_backoffice_user()
returns boolean
language sql
stable
as $$
  select public.current_app_role() in ('admin', 'super_admin');
$$;

-- Example usage in RLS policies:
-- create policy "agent can read own rows" on public.sales
-- for select using (
--   public.has_app_role('agent') and agent_id = auth.uid()
-- );
--
-- create policy "admin can read all org rows" on public.sales
-- for select using (
--   public.is_backoffice_user()
-- );

-- Notes for assigning roles:
-- Role should be written in auth.users app_metadata.role
-- Allowed values: 'agent', 'admin', 'super_admin'
--
-- Use Supabase Dashboard for single-user updates:
-- Authentication > Users > select user > Metadata > app_metadata.role
--
-- Or use Admin API from trusted server context:
-- supabase.auth.admin.updateUserById(userId, {
--   app_metadata: { role: 'agent' }
-- })


