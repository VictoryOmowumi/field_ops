"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useModule } from "@/components/providers/tenant-experience-provider";
import type { ModuleKey } from "@/lib/tenant-experience/types";

type ModuleRouteGuardProps = {
  module: ModuleKey;
  children: ReactNode;
  redirectTo?: string;
};

// Route-level module guard. Renders children when the module is enabled.
// When disabled, shows a clean "not enabled" message immediately and
// redirects to `redirectTo` (default: /admin/dashboard) after a brief pause
// so the user sees why they're being redirected rather than a blank flash.
export default function ModuleRouteGuard({
  module,
  children,
  redirectTo = "/admin/dashboard",
}: ModuleRouteGuardProps) {
  const enabled = useModule(module);
  const router = useRouter();

  useEffect(() => {
    if (!enabled) {
      const timer = setTimeout(() => {
        router.replace(redirectTo);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [enabled, router, redirectTo]);

  if (!enabled) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <div className="rounded-full bg-muted p-5">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-8 text-muted-foreground"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Module not available</h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            This module is not enabled for your workspace. Contact your administrator if you believe this is an error.
          </p>
          <p className="mt-4 text-xs text-muted-foreground">Redirecting to dashboard…</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
