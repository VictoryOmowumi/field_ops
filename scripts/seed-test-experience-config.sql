-- Tenant Experience Engine — test seed
-- =============================================================================
-- Run this in the Supabase SQL editor (or via psql/CLI) to apply a non-default
-- experience_config to a test organization so you can verify end-to-end that
-- the Tenant Experience Engine resolves terminology, modules, and shell variant
-- correctly in the browser.
--
-- HOW TO USE:
--   1. Replace 'your-test-org-slug' below with the actual slug of your test org.
--   2. Paste into the Supabase SQL Editor and run.
--   3. Sign in as a user belonging to that org.
--   4. Open the TenantDebugPanel (bottom-right corner in development) to confirm
--      the resolved config reflects the overrides below.
--   5. Verify localStorage key "actiq_tenant_experience" updates on next page load.
--
-- TO RESET (restore to platform defaults):
--   UPDATE public.organizations SET experience_config = '{}'::jsonb
--   WHERE slug = 'your-test-org-slug';
--
-- IMINNDX guard:
--   If slug = 'iminndx' (or your production org slug), this script will NOT
--   update it — the WHERE clause is intentionally slug-scoped.
-- =============================================================================

UPDATE public.organizations
SET experience_config = jsonb_build_object(
  'terminology', jsonb_build_object(
    'outlet',      'Store',
    'outlets',     'Stores',
    'agent',       'Field Officer',
    'agents',      'Field Officers',
    'campaign',    'Program',
    'campaigns',   'Programs',
    'conversion',  'Activation',
    'conversions', 'Activations',
    'visit',       'Site Visit',
    'visits',      'Site Visits',
    'posm',        'Display Unit',
    'freeSample',  'Trial Pack',
    'evidence',    'Photo Proof'
  ),
  'modules', jsonb_build_object(
    'posm',         false,
    'freeSampling', false
  ),
  'layout', jsonb_build_object(
    'shellVariant', 'sidebar',
    'uiVariant',    'enhanced'
  ),
  'dashboards', jsonb_build_object(
    'variant', 'command-center'
  ),
  'theme', jsonb_build_object(
    'colorPreset', 'blue',
    'fontUrl', 'https://fonts.googleapis.com/css2?family=Manrope:wght@200..800&display=swap'
  )
)
WHERE slug = 'brandx';

-- Set logo (separate update to keep experience_config clean):
UPDATE public.organizations
SET logo_url = 'https://brandx-ms.com/wp-content/uploads/2023/02/logo-white.png'
WHERE slug = 'brandx';

-- Confirm rows updated (should be 1 for a valid slug, 0 if slug not found):
SELECT id, name, slug,
       experience_config ->> 'terminology' AS terminology_preview,
       updated_at
FROM   public.organizations
WHERE  slug = 'brandx';
