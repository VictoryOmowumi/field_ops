import { timingSafeEqual } from "crypto";

import type { NextRequest } from "next/server";

function matchesSecret(token: string, secret: string | undefined) {
  if (!secret) return false;
  const expected = Buffer.from(secret);
  const provided = Buffer.from(token);
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

/** Authorizes internal/cron-triggered requests against INTERNAL_MONITORING_SECRET or Vercel's reserved CRON_SECRET. */
export function isInternalRequestAuthorized(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  const [scheme, token] = authHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return false;

  return matchesSecret(token, process.env.INTERNAL_MONITORING_SECRET) || matchesSecret(token, process.env.CRON_SECRET);
}
