"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { type AppRole, extractAppRole } from "@/lib/auth/roles";
import { supabaseClient } from "@/lib/supabase/client";
import { fetchWithTimeout } from "@/lib/api/client";
import type { OrgRole } from "@/lib/auth/org-access";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  cacheAgentAuthContext,
  getAnyCachedAgentAuthContext,
  getCachedAgentAuthContext,
  isLikelyOfflineError,
  type CachedAuthContext,
} from "@/lib/offline/agent-cache";

type RequireRoleProps = {
  allowedRoles: AppRole[];
  allowedOrgRoles?: OrgRole[];
  redirectOnOrgDeniedTo?: string;
  children: React.ReactNode;
};

type AccessState =
  | { status: "checking" }
  | { status: "ready" }
  | { status: "offline_blocked"; message: string };

type AuthContextResponse = {
  success: boolean;
  user?: {
    appRole?: AppRole;
    memberships?: Array<{
      organization_id?: string;
      role?: OrgRole;
      status?: string;
      organizations?: { status?: string };
    }>;
  };
};

export default function RequireRole({
  allowedRoles,
  allowedOrgRoles,
  redirectOnOrgDeniedTo = "/no-access",
  children,
}: RequireRoleProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [access, setAccess] = useState<AccessState>({ status: "checking" });

  useEffect(() => {
    let active = true;

    function cachedContextAllowsAccess(cached: CachedAuthContext | undefined, currentRole?: AppRole | null) {
      if (!cached) return false;
      const roleToCheck = currentRole ?? cached.appRole;
      const cachedAllowsRole = allowedRoles.includes(roleToCheck) && cached.appRole === roleToCheck;
      const cachedAllowsOrgRole = !allowedOrgRoles || (cached.orgRole && allowedOrgRoles.includes(cached.orgRole));
      const cachedIsActiveAgent = cached.appRole === "agent" && cached.orgRole === "agent";
      const orgIsUsable = cached.membershipStatus === "active" && cached.organizationStatus !== "suspended";
      return cachedAllowsRole && cachedAllowsOrgRole && cachedIsActiveAgent && orgIsUsable;
    }

    async function allowFromOfflineCache(message: string, userId?: string, role?: AppRole | null) {
      const cached = userId ? await getCachedAgentAuthContext(userId) : await getAnyCachedAgentAuthContext();
      if (!active) return;

      if (cachedContextAllowsAccess(cached, role)) {
        setAccess({ status: "ready" });
        return;
      }

      setAccess({ status: "offline_blocked", message });
    }

    async function checkAccess() {
      setAccess({ status: "checking" });
      try {
        await runCheckAccess();
      } catch {
        if (!active) return;
        // Unexpected throw (IndexedDB error, network race, etc.). Never leave the
        // agent stuck on the skeleton — resolve to a sensible terminal state.
        // Do NOT redirect to no-access for unexpected technical errors; that path
        // is only for genuine auth/role failures that runCheckAccess() handles
        // explicitly via router.replace() before returning.
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          setAccess({ status: "offline_blocked", message: "Reconnect once while signed in to prepare this device for offline use." });
        } else {
          // Stay on "checking" briefly then retry — avoids a permanent skeleton
          // without incorrectly redirecting for a transient technical failure.
          setTimeout(() => {
            if (active) void checkAccess();
          }, 1500);
        }
      }
    }

    async function runCheckAccess() {
      // Fast path: if the device is offline, skip getSession() entirely.
      // The Supabase SDK tries to refresh an expired JWT via network, which
      // can hang for 20-30 seconds before timing out — far too long to wait
      // before showing the agent their cached content.
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        await allowFromOfflineCache("Reconnect once while signed in to prepare this device for offline use.");
        return;
      }

      const { data, error } = await supabaseClient.auth.getSession();
      if (!active) return;

      const session = data.session;
      if (error || !session) {
        if (isLikelyOfflineError(error) || (typeof navigator !== "undefined" && !navigator.onLine)) {
          await allowFromOfflineCache("Reconnect once while signed in to prepare this device for offline use.");
          return;
        }
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        return;
      }

      const role = extractAppRole(session.user);
      if (!role || !allowedRoles.includes(role)) {
        await supabaseClient.auth.signOut();
        router.replace("/login?error=role_denied");
        return;
      }

      if (role !== "super_admin") {
        const token = session.access_token;
        let response: Response;
        try {
          response = await fetchWithTimeout("/api/auth/context", {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          });
        } catch (contextError) {
          if (isLikelyOfflineError(contextError)) {
            await allowFromOfflineCache(
              "Reconnect once while signed in to prepare this device for offline use.",
              session.user.id,
              role
            );
            return;
          }
          router.replace(redirectOnOrgDeniedTo);
          return;
        }

        if (!response.ok) {
          if (response.status === 503) {
            // Auth provider temporarily unreachable (server-side DNS failure to Supabase,
            // project paused, etc.). The JWT from getSession() is locally valid.
            // Try the offline cache first; if empty, synthesize a minimal context
            // from the JWT for agents so they aren't locked out during transient outages.
            const existing = await getCachedAgentAuthContext(session.user.id);
            if (!active) return;
            if (cachedContextAllowsAccess(existing, role)) {
              setAccess({ status: "ready" });
              return;
            }
            if (role === "agent") {
              await cacheAgentAuthContext({
                userId: session.user.id,
                appRole: "agent",
                orgRole: "agent",
                membershipStatus: "active",
                organizationStatus: "active",
                validatedAt: new Date().toISOString(),
              });
              if (!active) return;
              setAccess({ status: "ready" });
              return;
            }
            await allowFromOfflineCache(
              "Reconnect once while signed in to prepare this device for offline use.",
              session.user.id,
              role
            );
            return;
          }
          if ((response.status === 401 || response.status === 403) && typeof navigator !== "undefined" && !navigator.onLine) {
            await allowFromOfflineCache(
              "Reconnect once while signed in to prepare this device for offline use.",
              session.user.id,
              role
            );
            return;
          }
          if (response.status === 401 || response.status === 403) {
            await supabaseClient.auth.signOut();
            router.replace(`/login?next=${encodeURIComponent(pathname)}`);
            return;
          }
          // 404/500/other: likely a transient server or compilation issue,
          // not an auth decision. Retry instead of redirecting to no-access.
          if (response.status === 404 || response.status >= 500) {
            setTimeout(() => {
              if (active) void checkAccess();
            }, 1500);
            return;
          }
          router.replace(redirectOnOrgDeniedTo);
          return;
        }

        const result = (await response.json()) as AuthContextResponse;
        const membership = (result.user?.memberships ?? []).find((m) => m.status === "active")
          ?? (result.user?.memberships ?? [])[0];

        if (membership?.organizations?.status === "suspended") {
          router.replace("/suspended");
          return;
        }

        if (allowedOrgRoles && (!membership?.role || !allowedOrgRoles.includes(membership.role))) {
          router.replace(redirectOnOrgDeniedTo);
          return;
        }

        if (
          membership?.role === "supervisor" &&
          (pathname.startsWith("/admin/settings") || pathname.startsWith("/admin/users"))
        ) {
          router.replace(redirectOnOrgDeniedTo);
          return;
        }

        if (membership?.role) {
          await cacheAgentAuthContext({
            userId: session.user.id,
            appRole: role,
            organizationId: membership.organization_id,
            orgRole: membership.role,
            membershipStatus: membership.status,
            organizationStatus: membership.organizations?.status,
            validatedAt: new Date().toISOString(),
          });
        }
      }

      setAccess({ status: "ready" });
    }

    void checkAccess();
    return () => {
      active = false;
    };
  }, [allowedRoles, allowedOrgRoles, pathname, redirectOnOrgDeniedTo, router]);

  if (access.status === "offline_blocked") {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center space-y-4 px-4 py-10">
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
          <p className="text-sm font-semibold">Needs online preload</p>
          <p className="mt-2 text-sm">{access.message}</p>
        </div>
        <Button type="button" className="rounded-full" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }

  if (access.status !== "ready") {
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
