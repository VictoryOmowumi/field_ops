-- Phase 5: Commercial Activation Gate.
--
-- commercial.activation.log_only defaults 'true' — deliberately, so that flipping
-- commercial.activation.enabled (or an org's billing_accounts.gating_override) alone is never
-- enough to start hard-blocking anything. It only observes and logs what *would* block
-- (via platform_audit_logs, action "campaign_activation.would_block") until someone also
-- explicitly sets this to 'false'. That's the log-only soak period from
-- docs/architecture/commercial-implementation-roadmap.md Phase 5, encoded as a real default
-- rather than a step someone has to remember to do later.
insert into public.platform_settings (key, value, section, label)
values
  ('commercial.activation.log_only', 'true', 'Commercial', 'Log-only mode for the activation gate (observe, don''t block)')
on conflict (key) do nothing;
