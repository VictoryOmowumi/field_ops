import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  ignoreErrors: [
    // Known cosmetic noise from supabase-js's cross-tab auth lock coordination (Web Locks API).
    /Lock "lock:sb-.*-auth-token" was released/,
  ],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
