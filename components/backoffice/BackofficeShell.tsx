"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import BackofficeBrand from "./BackofficeBrand";
import BackofficeTopNav from "./BackofficeTopNav";
import BackofficeSessionActions from "./BackofficeSessionActions";
import BackofficeUtilityRail from "./BackofficeUtilityRail";
import { getBackofficeHomeHref, getBackofficeNav, getContextUtilityActions } from "./config";
import type { BackofficeRole } from "./types";

export default function BackofficeShell({
  role,
  children,
}: {
  role: BackofficeRole;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const nav = getBackofficeNav(role);
  const homeHref = getBackofficeHomeHref(role);
  const utilityActions = getContextUtilityActions(role, pathname);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 px-5 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-450 items-center gap-5">
          <BackofficeBrand homeHref={homeHref} />
          <BackofficeTopNav items={nav} pathname={pathname} />
          <BackofficeSessionActions role={role} />
        </div>
      </header>

      <div className="mx-auto flex max-w-450 gap-5 px-5 py-6">
        <BackofficeUtilityRail pathname={pathname} actions={utilityActions} />
        <section className="min-w-0 flex-1 px-1">{children}</section>
      </div>
    </main>
  );
}
