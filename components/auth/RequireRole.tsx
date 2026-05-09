"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { type AppRole, extractAppRole } from "@/lib/auth/roles";
import { supabaseClient } from "@/lib/supabase/client";
import type { OrgRole } from "@/lib/auth/org-access";
import { Skeleton } from "@/components/ui/skeleton";

type RequireRoleProps = {
  allowedRoles: AppRole[];
  allowedOrgRoles?: OrgRole[];
  redirectOnOrgDeniedTo?: string;
  children: React.ReactNode;
};

export default function RequireRole({
  allowedRoles,
  allowedOrgRoles,
  redirectOnOrgDeniedTo = "/no-access",
  children,
}: RequireRoleProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    async function checkAccess() {
      const { data, error } = await supabaseClient.auth.getSession();
      if (!active) return;

      const session = data.session;
      if (error || !session) {
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        return;
      }

      const role = extractAppRole(session.user);
      if (!role || !allowedRoles.includes(role)) {
        await supabaseClient.auth.signOut();
        router.replace("/login?error=role_denied");
        return;
      }

      if (allowedOrgRoles && role !== "super_admin") {
        const token = session.access_token;
        const response = await fetch("/api/auth/context", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!response.ok) {
          if (response.status === 401) {
            await supabaseClient.auth.signOut();
            router.replace(`/login?next=${encodeURIComponent(pathname)}`);
            return;
          }
          router.replace(redirectOnOrgDeniedTo);
          return;
        }
        const result = (await response.json()) as {
          success: boolean;
          user?: {
            memberships?: Array<{ role?: OrgRole; status?: string }>;
          };
        };
        const membership = (result.user?.memberships ?? []).find((m) => m.status === "active")
          ?? (result.user?.memberships ?? [])[0];

        if (!membership?.role || !allowedOrgRoles.includes(membership.role)) {
          router.replace(redirectOnOrgDeniedTo);
          return;
        }

        if (
          membership.role === "supervisor" &&
          (pathname.startsWith("/admin/settings") || pathname.startsWith("/admin/users"))
        ) {
          router.replace(redirectOnOrgDeniedTo);
          return;
        }
      }

      setReady(true);
    }

    void checkAccess();
    return () => {
      active = false;
    };
  }, [allowedRoles, allowedOrgRoles, pathname, redirectOnOrgDeniedTo, router]);

  if (!ready) {
    return (
      <div className="mx-auto w-full container space-y-3 px-4 py-10">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  return <>{children}</>;
}
