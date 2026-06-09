"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  Moon02Icon,
  Sun01Icon,
  CellularNetworkIcon,
} from "@hugeicons/core-free-icons";

import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useThemeMode } from "@/hooks/useThemeMode";
import { Button } from "@/components/ui/button";
import AgentSessionMenu from "@/components/agent/AgentSessionMenu";
import { useAgentBootstrap } from "@/hooks/useAgentBootstrap";
import { useBrand } from "@/components/providers/brand-provider";

export default function AgentHeader() {
  const isOnline = useOnlineStatus();
  const { toggleTheme } = useThemeMode();
  const bootstrapQuery = useAgentBootstrap();
  const { brandName, logoUrl } = useBrand();
 

  return (
    <header className="sticky top-0 z-30 bg-background/95">
      <div className="py-2 px-4 ">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-xl bg-primary p-1">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- dynamic org logo
                <img src={logoUrl} alt={brandName} className="h-full w-full object-contain" />
              ) : (
                <span className="text-xs font-bold text-primary-foreground">
                  {brandName.trim().charAt(0).toUpperCase()}
                </span>
              )}
            </span>
            <span className="text-sm font-semibold text-foreground">{brandName}</span>
          </div>

          <div className="flex items-center gap-2">
            {/* <Button
              variant="secondary"
              size="icon"
              className="rounded-full bg-muted/70 text-foreground hover:bg-muted"
              aria-label="Notifications"
            >
              <HugeiconsIcon
                icon={Notification01Icon}
                size={18}
                strokeWidth={1.9}
              />
            </Button> */}
            <Button
              variant="secondary"
              size="icon"
              onClick={toggleTheme}
              className="rounded-full bg-muted/70 text-foreground hover:bg-muted"
              aria-label="Toggle theme"
            >
              <span className="dark:hidden">
                <HugeiconsIcon icon={Moon02Icon} size={18} strokeWidth={1.9} />
              </span>
              <span className="hidden dark:inline-flex">
                <HugeiconsIcon icon={Sun01Icon} size={18} strokeWidth={1.9} />
              </span>
            </Button>
            {/* <Button
              variant="secondary"
              size="icon"
              className="rounded-full bg-muted/70 text-foreground hover:bg-muted"
              aria-label="More options"
              onPointerDown={showDebugToast}
            >
              <HugeiconsIcon
                icon={DashboardCircleIcon}
                size={18}
                strokeWidth={1.9}
              />
            </Button> */}
            <Button
              variant="secondary"
              size="icon"
              className={`rounded-full ${
                isOnline ? "bg-green-500" : "bg-red-500"
              }  pointer-events-none`}
              aria-label={isOnline ? "Online" : "Offline"}
            >
              <HugeiconsIcon
                icon={CellularNetworkIcon}
                size={18}
                strokeWidth={1.9}
              />
            </Button>
            <AgentSessionMenu
              fullName={bootstrapQuery.data?.profile.fullName}
              roleLabel={bootstrapQuery.data?.profile.organizationRole}
            />
          </div>
        </div>
      </div>
    </header>
  );
}
