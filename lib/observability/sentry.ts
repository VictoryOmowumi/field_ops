import * as Sentry from "@sentry/nextjs";

export type CaptureContext = {
  userId?: string | null;
  organizationId?: string | null;
  campaignId?: string | null;
  route?: string | null;
  device?: string | null;
  /** Skip sending to Sentry entirely (expected validation errors, user cancellations). */
  expected?: boolean;
};

const EXPECTED_ERROR_PATTERN = /required|invalid|violates/i;

function looksExpected(error: unknown, context?: CaptureContext) {
  if (context?.expected !== undefined) return context.expected;
  const message = error instanceof Error ? error.message : String(error);
  return EXPECTED_ERROR_PATTERN.test(message);
}

function applyScope(scope: Sentry.Scope, context?: CaptureContext) {
  scope.setTag("environment", process.env.SENTRY_ENVIRONMENT ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown");
  if (context?.userId) scope.setTag("userId", context.userId);
  if (context?.organizationId) scope.setTag("organizationId", context.organizationId);
  if (context?.campaignId) scope.setTag("campaignId", context.campaignId);
  if (context?.route) scope.setTag("route", context.route);
  if (context?.device) scope.setTag("device", context.device);
}

export function captureException(error: unknown, context?: CaptureContext) {
  if (looksExpected(error, context)) return;

  Sentry.withScope((scope) => {
    applyScope(scope, context);
    Sentry.captureException(error);
  });
}

export function captureMessage(
  message: string,
  context?: CaptureContext & { severity?: Sentry.SeverityLevel }
) {
  if (context?.expected) return;

  Sentry.withScope((scope) => {
    applyScope(scope, context);
    Sentry.captureMessage(message, context?.severity ?? "info");
  });
}
