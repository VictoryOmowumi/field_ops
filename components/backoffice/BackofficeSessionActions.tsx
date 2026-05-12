"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import { Logout03Icon, Moon02Icon, Notification01Icon, Sun01Icon, UserCircleIcon } from "@hugeicons/core-free-icons";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useThemeMode } from "@/hooks/useThemeMode";
import { extractAppRole } from "@/lib/auth/roles";
import { supabaseClient } from "@/lib/supabase/client";
import type { BackofficeRole } from "./types";

type SessionUserSummary = {
  fullName: string;
  roleLabel: string;
  email: string;
  organizationName: string;
};

function formatRoleLabel(role: string | null) {
  if (!role) return "User";
  if (role === "super_admin") return "Super Admin";
  if (role === "org_admin") return "Organization Admin";
  if (role === "supervisor") return "Supervisor";
  if (role === "admin") return "Organization Admin";
  return "Agent";
}

function resolveProfileHref(role: BackofficeRole) {
  return role === "super_admin" ? "/super-admin/users" : "/admin/users";
}

export default function BackofficeSessionActions({ role }: { role: BackofficeRole }) {
  const { theme, toggleTheme } = useThemeMode();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [user, setUser] = useState<SessionUserSummary>({
    fullName: "Backoffice User",
    roleLabel: formatRoleLabel(role),
    email: "",
    organizationName: "",
  });
  const profileHref = useMemo(() => resolveProfileHref(role), [role]);

  useEffect(() => {
    async function loadSessionUser() {
      const { data } = await supabaseClient.auth.getSession();
      const sessionUser = data.session?.user;
      if (!sessionUser) return;

      const metadata = sessionUser.user_metadata ?? {};
      const fullName =
        (metadata.full_name as string | undefined) ||
        (metadata.name as string | undefined) ||
        sessionUser.email ||
        "Backoffice User";
      const appRole = extractAppRole(sessionUser);
      const token = data.session?.access_token;
      let roleLabel = formatRoleLabel(appRole);
      if (token) {
        const response = await fetch("/api/auth/context", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          const result = (await response.json()) as {
            success: boolean;
            user?: {
              memberships?: Array<{
                role?: string;
                status?: string;
                organizations?: { name?: string | null };
              }>;
            };
          };
          const activeMembership = (result.user?.memberships ?? []).find((m) => m.status === "active")
            ?? (result.user?.memberships ?? [])[0];
          if (activeMembership?.role) {
            roleLabel = formatRoleLabel(activeMembership.role);
          }
          const organizationName = activeMembership?.organizations?.name ?? "";
          setUser({
            fullName,
            roleLabel,
            email: sessionUser.email ?? "",
            organizationName,
          });
          return;
        }
      }
      setUser({
        fullName,
        roleLabel,
        email: sessionUser.email ?? "",
        organizationName: "",
      });
    }

    void loadSessionUser();
  }, [role]);

  const initials = useMemo(() => {
    const tokens = user.fullName.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return "BU";
    if (tokens.length === 1) return tokens[0].slice(0, 2).toUpperCase();
    return `${tokens[0][0] ?? ""}${tokens[1][0] ?? ""}`.toUpperCase();
  }, [user.fullName]);

  async function handleSignOut() {
    setSigningOut(true);
    const { error } = await supabaseClient.auth.signOut();
    setSigningOut(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    router.replace("/login");
  }

  return (
    <div className="ml-auto flex items-center gap-2">
      <Button type="button" variant="outline" size="icon" className="size-10 rounded-full bg-background">
        <HugeiconsIcon icon={Notification01Icon} size={17} strokeWidth={1.8} />
      </Button>

      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-10 rounded-full bg-background"
        onClick={toggleTheme}
      >
        <HugeiconsIcon icon={theme === "dark" ? Sun01Icon : Moon02Icon} size={17} strokeWidth={1.8} />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="rounded-full border border-border bg-muted p-0.5">
            <Avatar className="size-9">
              <AvatarFallback className="bg-muted text-xs font-semibold text-muted-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="space-y-0.5">
            <p className="text-sm font-medium text-foreground">{user.fullName}</p>
            <p className="text-xs text-muted-foreground">{user.roleLabel} —  {user.organizationName ? <p className="text-xs text-muted-foreground">{user.organizationName}</p> : null}</p>
           
            {user.email ? <p className="text-xs text-muted-foreground">{user.email}</p> : null}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href={profileHref}>
              <HugeiconsIcon icon={UserCircleIcon} size={16} strokeWidth={1.8} />
              Organization Users
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void handleSignOut()} disabled={signingOut}>
            <HugeiconsIcon icon={Logout03Icon} size={16} strokeWidth={1.8} />
            {signingOut ? "Signing out..." : "Sign Out"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
