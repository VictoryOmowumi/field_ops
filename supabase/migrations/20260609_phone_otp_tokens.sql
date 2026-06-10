-- Phone OTP tokens table for Africa's Talking SMS-based authentication.
-- Service-role-only access — no RLS needed (bypassed by service role key).

CREATE TABLE IF NOT EXISTS public.phone_otp_tokens (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       text        NOT NULL,
  otp_hash    text        NOT NULL,
  expires_at  timestamptz NOT NULL,
  attempts    int         NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Fast lookup by phone when checking/verifying
CREATE INDEX IF NOT EXISTS idx_phone_otp_tokens_phone_active
  ON public.phone_otp_tokens(phone, created_at DESC)
  WHERE consumed_at IS NULL;
