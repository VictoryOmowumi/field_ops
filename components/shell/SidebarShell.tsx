"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Logout03Icon,
  Moon02Icon,
  Notification01Icon,
  Search01Icon,
  Sun01Icon,
  UserCircleIcon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";

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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useBrand } from "@/components/providers/brand-provider";
import { useResolvedNav } from "@/components/backoffice/useResolvedNav";
import { getBackofficeHomeHref } from "@/components/backoffice/config";
import { useThemeMode } from "@/hooks/useThemeMode";
import { supabaseClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { BackofficeRole, NavAction } from "@/components/backoffice/types";

const COLLAPSE_KEY = "actiq_sidebar_collapsed";

type SessionUser = {
  fullName: string;
  email: string;
  roleLabel: string;
  initials: string;
};

function formatRoleLabel(role: string) {
  const map: Record<string, string> = {
    super_admin: "Super Admin",
    org_admin: "Org Admin",
    admin: "Org Admin",
    supervisor: "Supervisor",
  };
  return map[role] ?? "User";
}

function useSessionUser(role: BackofficeRole): SessionUser {
  const [user, setUser] = useState<SessionUser>({
    fullName: "User",
    email: "",
    roleLabel: formatRoleLabel(role),
    initials: "U",
  });

  useEffect(() => {
    async function load() {
      const { data } = await supabaseClient.auth.getSession();
      const u = data.session?.user;
      if (!u) return;
      const meta = u.user_metadata ?? {};
      const fullName =
        (meta.full_name as string | undefined) ||
        (meta.name as string | undefined) ||
        u.email ||
        "User";
      const tokens = fullName.trim().split(/\s+/).filter(Boolean);
      const initials =
        tokens.length === 0
          ? "U"
          : tokens.length === 1
          ? tokens[0].slice(0, 2).toUpperCase()
          : `${tokens[0][0] ?? ""}${tokens[1][0] ?? ""}`.toUpperCase();

      const token = data.session?.access_token;
      let roleLabel = formatRoleLabel(role);
      if (token) {
        const res = await fetch("/api/auth/context", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const payload = (await res.json()) as {
            user?: { memberships?: Array<{ role?: string; status?: string }> };
          };
          const active =
            (payload.user?.memberships ?? []).find((m) => m.status === "active") ??
            (payload.user?.memberships ?? [])[0];
          if (active?.role) roleLabel = formatRoleLabel(active.role);
        }
      }
      setUser({ fullName, email: u.email ?? "", roleLabel, initials });
    }
    void load();
  }, [role]);

  return user;
}

// ── Nav item — adapts to collapsed/expanded ──────────────────────────────────

function SidebarNavItem({
  item,
  pathname,
  collapsed,
}: {
  item: NavAction;
  pathname: string;
  collapsed: boolean;
}) {
  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

  const iconEl = (
    <span
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-lg transition-colors",
        isActive
          ? "bg-white/20 text-inherit"
          : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
      )}
    >
      <HugeiconsIcon icon={item.icon as never} size={15} strokeWidth={2} />
    </span>
  );

  const linkClass = cn(
    "group flex items-center rounded-xl transition-colors",
    collapsed ? "justify-center px-0 py-2" : "gap-3 px-3 py-2.5",
    isActive
      ? "bg-primary text-primary-foreground"
      : "text-muted-foreground hover:bg-muted hover:text-foreground"
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link href={item.href} className={linkClass}>
            {iconEl}
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Link href={item.href} className={cn(linkClass, "text-sm font-medium")}>
      {iconEl}
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

// ── Brand ────────────────────────────────────────────────────────────────────

function SidebarBrand({
  homeHref,
  collapsed,
}: {
  homeHref: string;
  collapsed: boolean;
}) {
  const { brandName, logoUrl } = useBrand();
  const logoEl = (
    <span className={cn(
      "grid size-8 shrink-0 place-items-center overflow-hidden rounded-xl",
      logoUrl
        ? "bg-primary p-1"
        : "border border-border bg-muted"
    )}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- dynamic org logo URL
        <img src={logoUrl} alt={brandName} className="h-full w-full object-contain" />
      ) : (
        <span className="text-xs font-bold text-foreground">
          {brandName.trim().charAt(0).toUpperCase()}
        </span>
      )}
    </span>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link href={homeHref} className="flex justify-center px-0 py-3.5">
            {logoEl}
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">{brandName}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Link href={homeHref} className="flex items-center gap-3 px-4 py-3.5">
      {logoEl}
      <span className="truncate text-sm font-semibold text-foreground">{brandName}</span>
    </Link>
  );
}

// ── User footer ──────────────────────────────────────────────────────────────

function SidebarUserFooter({
  role,
  collapsed,
}: {
  role: BackofficeRole;
  collapsed: boolean;
}) {
  const user = useSessionUser(role);
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const profileHref = role === "super_admin" ? "/super-admin/users" : "/admin/users";

  async function handleSignOut() {
    setSigningOut(true);
    const { error } = await supabaseClient.auth.signOut();
    setSigningOut(false);
    if (error) { toast.error(error.message); return; }
    router.replace("/login");
  }

  const trigger = collapsed ? (
    <button
      type="button"
      className="flex w-full justify-center rounded-xl p-2 transition-colors hover:bg-muted"
    >
      <Avatar className="size-8 shrink-0">
        <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
          {user.initials}
        </AvatarFallback>
      </Avatar>
    </button>
  ) : (
    <button
      type="button"
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-muted"
    >
      <Avatar className="size-8 shrink-0">
        <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
          {user.initials}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{user.fullName}</p>
        <p className="truncate text-xs text-muted-foreground">{user.roleLabel}</p>
      </div>
    </button>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent side="top" align={collapsed ? "center" : "start"} className="w-56">
        <DropdownMenuLabel className="space-y-0.5">
          <p className="text-sm font-medium">{user.fullName}</p>
          {user.email ? (
            <p className="text-xs text-muted-foreground">{user.email}</p>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={profileHref}>
            <HugeiconsIcon icon={UserCircleIcon} size={15} strokeWidth={1.8} />
            Organization Users
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void handleSignOut()} disabled={signingOut}>
          <HugeiconsIcon icon={Logout03Icon} size={15} strokeWidth={1.8} />
          {signingOut ? "Signing out…" : "Sign Out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Collapse toggle button ────────────────────────────────────────────────────

function CollapseToggle({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "flex items-center justify-center rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            collapsed ? "w-full" : "ml-auto"
          )}
        >
          <HugeiconsIcon
            icon={collapsed ? ArrowRight01Icon : ArrowLeft01Icon}
            size={14}
            strokeWidth={2}
          />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">
        {collapsed ? "Expand sidebar" : "Collapse sidebar"}
      </TooltipContent>
    </Tooltip>
  );
}

// ── Minimal top bar ───────────────────────────────────────────────────────────

function MinimalTopBar() {
  const { theme, toggleTheme } = useThemeMode();
  const [cmdOpen, setCmdOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <header className="flex h-14 shrink-0 items-center border-b border-border/60 bg-background/80 px-4 backdrop-blur-sm">
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-10! w-72 flex justify-between bg-sidebar gap-2 rounded-lg px-3 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setCmdOpen(true)}
          >
            <HugeiconsIcon icon={Search01Icon} size={14} />
            {/* <span className="hidden sm:inline">Search</span> */}
            <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] sm:inline-block">
              ⌘K — Search
            </kbd>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 rounded-lg text-muted-foreground hover:text-foreground"
          >
            <HugeiconsIcon icon={Notification01Icon} size={15} strokeWidth={1.8} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 rounded-lg text-muted-foreground hover:text-foreground"
            onClick={toggleTheme}
          >
            <HugeiconsIcon
              icon={theme === "dark" ? Sun01Icon : Moon02Icon}
              size={15}
              strokeWidth={1.8}
            />
          </Button>
        </div>
      </header>

      {cmdOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-foreground/30 pt-24 backdrop-blur-sm"
          onClick={() => setCmdOpen(false)}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-3xl border border-border bg-background shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <HugeiconsIcon icon={Search01Icon} size={16} className="text-muted-foreground" />
              <input
                autoFocus
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                placeholder="Search pages, campaigns, outlets…"
                onKeyDown={(e) => e.key === "Escape" && setCmdOpen(false)}
              />
              <kbd className="rounded-md border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                ESC
              </kbd>
            </div>
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Full command palette — coming soon.
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

// ── Main shell ────────────────────────────────────────────────────────────────

export default function SidebarShell({
  role,
  children,
}: {
  role: BackofficeRole;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const nav = useResolvedNav(role);
  const homeHref = useMemo(() => getBackofficeHomeHref(role), [role]);

  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(COLLAPSE_KEY) === "true";
  });

  function toggleCollapse() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSE_KEY, String(next));
      return next;
    });
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-screen overflow-hidden bg-background">
        {/* ── Sidebar ── */}
        <aside
          className={cn(
            "flex shrink-0 flex-col border-r border-border/60 bg-card transition-[width] duration-200 ease-in-out overflow-hidden",
            collapsed ? "w-14" : "w-60"
          )}
        >
          {/* Brand */}
          <div className="border-b border-border/60">
            <SidebarBrand homeHref={homeHref} collapsed={collapsed} />
          </div>

          {/* Nav */}
          <nav
            className={cn(
              "flex-1 overflow-y-auto py-4 space-y-6",
              collapsed ? "px-2" : "px-3"
            )}
          >
            {nav.map((item) => (
              <SidebarNavItem
                key={item.href}
                item={item}
                pathname={pathname}
                collapsed={collapsed}
              />
            ))}
          </nav>

          {/* Footer: collapse toggle + user */}
          <div
            className={cn(
              "border-t border-border/60 p-2 space-y-1",
              collapsed ? "items-center" : ""
            )}
          >
            <CollapseToggle collapsed={collapsed} onToggle={toggleCollapse} />
            <SidebarUserFooter role={role} collapsed={collapsed} />
          </div>
        </aside>

        {/* ── Main area ── */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <MinimalTopBar />
          <main className="flex-1 overflow-y-auto overflow-x-hidden mx-auto container px-6 py-6">
            {children}
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
