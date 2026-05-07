# Supabase Auth Email Templates (ActivationIQ)

This folder contains branded templates and rollout guidance for Supabase Auth emails.

## Templates in this folder

- `invite-confirmation.html`
- `password-recovery.html`
- `magic-link.html` (optional)

## Brand tokens

- Product name: `ActivationIQ`
- Support email: `support@activationiq.app`
- Primary CTA label: context specific (`Set Password`, `Reset Password`, `Sign In`)
- Footer: `ActivationIQ • Field activation and sync platform`

## How to apply in Supabase Dashboard

1. Open **Supabase Dashboard → Authentication → Email Templates**.
2. Paste the corresponding HTML from this folder into:
   - Invite user
   - Reset password
   - Magic link (if enabled)
3. Keep default sender settings for this phase (Templates Only scope).
4. Save changes.

## Required URL placeholders

Ensure each template uses Supabase placeholders:

- `{{ .ConfirmationURL }}`
- `{{ .SiteURL }}`
- `{{ .TokenHash }}` when required by template mode

The app should set `NEXT_PUBLIC_APP_URL` correctly in environment config.

## Non-production verification checklist

1. Send invite email from `/admin/users/new`.
2. Verify CTA lands on `{{ .ConfirmationURL }}` and redirects into `/accept-invite`.
3. Trigger forgot-password flow from `/forgot-password`.
4. Verify reset CTA opens `/reset-password`.
5. Verify logo, headline, footer, and support details render properly in:
   - Gmail
   - Outlook
   - iOS Mail
6. Verify dark mode readability in common mail clients.
