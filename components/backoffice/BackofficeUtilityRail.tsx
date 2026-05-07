import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { UtilityAction } from "./types";

export default function BackofficeUtilityRail({
  pathname,
  actions,
}: {
  pathname: string;
  actions: UtilityAction[];
}) {
  return (
    <aside className="sticky top-24 hidden h-[calc(100vh-7rem)] w-14 shrink-0 items-center md:flex">
      <TooltipProvider>
        <div className="flex w-full flex-col items-center gap-2 rounded-full border border-border/70 bg-card/80 p-1.5 shadow-sm backdrop-blur">
          {actions.map((action) => {
            const href = action.href;
            const isOverviewAction = action.label === "Overview";
            const isActive = href
              ? isOverviewAction
                ? pathname === href
                : pathname === href || pathname.startsWith(`${href}/`)
              : false;

            return (
              <Tooltip key={action.label}>
                <TooltipTrigger asChild>
                  {href ? (
                    <Link
                      href={href}
                      className={cn(
                        "grid size-10 place-items-center rounded-full transition",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/70 text-muted-foreground hover:bg-primary hover:text-primary-foreground"
                      )}
                    >
                      <HugeiconsIcon icon={action.icon as never} size={17} strokeWidth={1.8} />
                    </Link>
                  ) : (
                    <button
                      className="grid size-10 place-items-center rounded-full bg-muted/70 text-muted-foreground transition hover:bg-primary hover:text-primary-foreground"
                      type="button"
                    >
                      <HugeiconsIcon icon={action.icon as never} size={17} strokeWidth={1.8} />
                    </button>
                  )}
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={10}>
                  {action.label}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>
    </aside>
  );
}
