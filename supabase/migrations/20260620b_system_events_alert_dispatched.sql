create index if not exists system_events_alert_dispatched_idx
  on public.system_events (event_type, created_at desc)
  where event_type = 'alert_dispatched';
