const DEFAULT_COUNTRY_CODE = "234";

/**
 * Normalizes a phone number to E.164 (e.g. +2348031234567).
 * Accepts local Nigerian formats (0803...), already-international
 * formats (+234..., 234..., 00234...), and falls back to prefixing
 * the default country code for bare subscriber numbers.
 * Returns null if the input can't be normalized to a plausible E.164 number.
 */
export function normalizePhoneToE164(input: string, defaultCountryCode = DEFAULT_COUNTRY_CODE): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const digits = trimmed.replace(/[^\d+]/g, "");

  if (digits.startsWith("+")) {
    const rest = digits.slice(1);
    return /^\d{8,15}$/.test(rest) ? `+${rest}` : null;
  }

  if (digits.startsWith("00")) {
    const rest = digits.slice(2);
    return /^\d{8,15}$/.test(rest) ? `+${rest}` : null;
  }

  if (digits.startsWith("0")) {
    const rest = digits.slice(1);
    return /^\d{7,14}$/.test(rest) ? `+${defaultCountryCode}${rest}` : null;
  }

  if (/^\d{7,15}$/.test(digits)) {
    return `+${defaultCountryCode}${digits}`;
  }

  return null;
}

export function isValidE164(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value);
}

/**
 * Default password for phone-auth accounts: the last 6 digits of the
 * E.164 phone number. Meets the 6-character minimum and lets agents
 * sign in without an SMS OTP. They're prompted to change it after login.
 */
export function getDefaultPasswordForPhone(e164Phone: string): string {
  return e164Phone.slice(-6);
}
