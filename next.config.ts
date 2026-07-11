import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/**",
      },
      // Cloudflare R2 evidence (Phase 7 dual-provider storage). next/image refuses to render any
      // remote src whose hostname isn't allow-listed here, regardless of a valid signed URL —
      // without this, every R2-stored evidence image throws at render time.
      ...(process.env.R2_ACCOUNT_ID
        ? [
            {
              protocol: "https" as const,
              hostname: `${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
            },
          ]
        : []),
    ],
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  sourcemaps: {
    disable: true,
  },
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
