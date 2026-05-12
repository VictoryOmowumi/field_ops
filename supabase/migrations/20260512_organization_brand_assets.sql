alter table public.organizations
  add column if not exists brand_favicon_ico_url text,
  add column if not exists brand_favicon_16_url text,
  add column if not exists brand_favicon_32_url text,
  add column if not exists brand_apple_touch_icon_url text,
  add column if not exists brand_android_192_url text,
  add column if not exists brand_android_512_url text,
  add column if not exists brand_manifest_url text;

