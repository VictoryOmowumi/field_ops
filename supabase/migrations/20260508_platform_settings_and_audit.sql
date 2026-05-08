create table if not exists public.platform_settings (
  key text primary key,
  value text not null,
  section text not null,
  label text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

create table if not exists public.platform_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null,
  target_type text not null,
  target_id text not null,
  action text not null,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);

insert into public.platform_settings (key, value, section, label)
values
  ('sync_retry_attempts', '5', 'Sync', 'Default sync retry attempts'),
  ('offline_queue_timeout_minutes', '20', 'Sync', 'Offline queue timeout'),
  ('photo_upload_max_size_mb', '8', 'Storage', 'Photo upload max size'),
  ('default_media_retention_days', '180', 'Storage', 'Default media retention'),
  ('default_organization_status', 'Active', 'Tenant', 'Default organization status'),
  ('global_incident_alert_threshold', '3 failed sync windows', 'Tenant', 'Global incident alert threshold')
on conflict (key) do nothing;

