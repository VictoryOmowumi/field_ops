-- Rep payment profile fields

alter table public.rep_profiles
  add column if not exists bank_name text,
  add column if not exists account_number text,
  add column if not exists account_name text,
  add column if not exists payment_type text check (payment_type in ('daily_rate', 'commission', 'daily_plus_commission')),
  add column if not exists daily_rate numeric,
  add column if not exists commission_rate numeric;

