-- Phone+password auth: track accounts still using their default
-- (phone-derived) password so we can prompt them to change it.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
