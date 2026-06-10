-- Phase 1: Phone auth support
-- Adds auth_method + phone_verified_at to profiles.
-- Adds a global unique index on phone (matches Supabase's own phone uniqueness in auth.users).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS auth_method text NOT NULL DEFAULT 'email'
    CHECK (auth_method IN ('email', 'phone')),
  ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz;

-- De-duplicate: for any phone that appears more than once, keep the most
-- recently updated row and clear the phone on older duplicates so the
-- unique index can be created cleanly.
UPDATE public.profiles p
SET phone = NULL
WHERE phone IS NOT NULL
  AND user_id NOT IN (
    SELECT DISTINCT ON (phone) user_id
    FROM public.profiles
    WHERE phone IS NOT NULL
    ORDER BY phone, updated_at DESC NULLS LAST
  );

-- phone must be globally unique — one Supabase auth user per phone number.
-- NULLS are excluded so unset phones don't conflict.
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_phone_unique
  ON public.profiles(phone)
  WHERE phone IS NOT NULL;
