"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Logout03Icon,
  Moon02Icon,
  Notification01Icon,
  Search01Icon,
  Sun01Icon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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

// CommandRailShell — the "command-center" layout variant.
// Left icon rail (64 px) + full-height scrollable content area.
// Enabled via organizations.experience_config.layout.shellVariant = "command-rail".
// BackofficeShell is unchanged; this is a purely additive second variant.

type SessionUser = {
  fullName: string;
  email: string;
  initials: string;
};

function useSessionUser(): SessionUser {
  const [user, setUser] = useState<SessionUser>({
    fullName: "User",
    email: "",
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
      setUser({ fullName, email: u.email ?? "", initials });
    }
    void load();
  }, []);

  return user;
}

// --- Rail nav button (icon + tooltip) ---

function RailNavButton({ item, pathname }: { item: NavAction; pathname: string }) {
  const isActive =
    pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={item.href}
          className={cn(
            "group relative flex size-10 items-center justify-center rounded-xl transition-all",
            isActive
              ? "bg-background/20 text-background shadow-sm"
              : "text-background/50 hover:bg-background/10 hover:text-background"
          )}
        >
          {isActive && (
            <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-background" />
          )}
          <HugeiconsIcon icon={item.icon as never} size={18} strokeWidth={1.8} />
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {item.label}
      </TooltipContent>
    </Tooltip>
  );
}

// --- Rail icon button (generic action) ---

function RailIconButton({
  icon,
  label,
  onClick,
  className,
}: {
  icon: unknown;
  label: string;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className={cn(
            "flex size-10 items-center justify-center rounded-xl text-background/50 transition-all hover:bg-background/10 hover:text-background",
            className
          )}
        >
          <HugeiconsIcon icon={icon as never} size={18} strokeWidth={1.8} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

// --- Workspace switcher (logo or org initial) ---

function WorkspaceSwitcher({ homeHref }: { homeHref: string }) {
  const { brandName, logoUrl } = useBrand();
  const initial = brandName.trim().charAt(0).toUpperCase() || "W";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={homeHref}
          className="flex size-10 items-center justify-center overflow-hidden rounded-xl bg-background/15 transition-all hover:bg-background/25"
        >
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- dynamic org logo URL, same pattern as BackofficeBrand
            <img
              src={logoUrl}
              alt={brandName}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-sm font-bold text-background">{initial}</span>
          )}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {brandName}
      </TooltipContent>
    </Tooltip>
  );
}

// --- User menu (avatar + dropdown) ---

function RailUserMenu({ role }: { role: BackofficeRole }) {
  const user = useSessionUser();
  const { theme, toggleTheme } = useThemeMode();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const profileHref =
    role === "super_admin" ? "/super-admin/users" : "/admin/users";

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
    <div className="flex flex-col items-center gap-1">
      <RailIconButton
        icon={theme === "dark" ? Sun01Icon : Moon02Icon}
        label={theme === "dark" ? "Light mode" : "Dark mode"}
        onClick={toggleTheme}
      />
      <RailIconButton icon={Notification01Icon} label="Notifications" />
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex size-10 items-center justify-center rounded-xl transition-all hover:bg-background/10"
              >
                <Avatar className="size-8">
                  <AvatarFallback className="bg-background/20 text-xs font-semibold text-background">
                    {user.initials}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {user.fullName}
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent side="right" align="end" className="w-60">
          <DropdownMenuLabel className="space-y-0.5">
            <p className="text-sm font-medium">{user.fullName}</p>
            {user.email ? (
              <p className="text-xs text-muted-foreground">{user.email}</p>
            ) : null}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href={profileHref}>Organization Users</Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => void handleSignOut()}
            disabled={signingOut}
          >
            <HugeiconsIcon icon={Logout03Icon} size={16} strokeWidth={1.8} />
            {signingOut ? "Signing out…" : "Sign Out"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// --- Command search button ---

function RailCommandButton() {
  const [open, setOpen] = useState(false);

  // Wire up ⌘K / Ctrl+K
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <RailIconButton
        icon={Search01Icon}
        label="Search  ⌘K"
        onClick={() => setOpen(true)}
      />
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-foreground/30 pt-24 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-3xl border border-border bg-background shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <HugeiconsIcon
                icon={Search01Icon}
                size={16}
                className="text-muted-foreground"
              />
              <input
                autoFocus
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                placeholder="Search pages, campaigns, outlets…"
                onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
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

// --- Main shell ---

export default function CommandRailShell({
  role,
  children,
}: {
  role: BackofficeRole;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const nav = useResolvedNav(role);
  const homeHref = useMemo(() => getBackofficeHomeHref(role), [role]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-screen overflow-hidden bg-background">
        {/* Icon rail */}
        <aside className="relative z-20 flex w-16 shrink-0 flex-col items-center bg-foreground py-4">
          {/* Workspace switcher */}
          <WorkspaceSwitcher homeHref={homeHref} />

          {/* Nav icons */}
          <nav className="mt-6 flex flex-1 flex-col items-center gap-1">
            {nav.map((item) => (
              <RailNavButton key={item.href} item={item} pathname={pathname} />
            ))}
          </nav>

          {/* Bottom actions */}
          <div className="flex flex-col items-center gap-1">
            <RailCommandButton />
            <RailUserMenu role={role} />
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-300 px-8 py-8">{children}</div>
        </main>
      </div>
    </TooltipProvider>
  );
}
