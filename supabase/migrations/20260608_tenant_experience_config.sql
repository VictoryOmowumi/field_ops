-- Tenant Experience Engine: per-organization experience configuration
-- Additive only — existing branding columns and behavior are untouched.
-- An empty/absent config resolves to defaults that match current (IMINNDX) behavior exactly.

alter table public.organizations
  add column if not exists experience_config jsonb not null default '{}'::jsonb;

comment on column public.organizations.experience_config is
  'Tenant Experience Engine config: terminology, modules, layout, navigation, dashboards, workflow overrides. Deep-merged over platform defaults at read time — partial configs only override what they specify.';
