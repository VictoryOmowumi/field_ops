import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";

import { cn } from "@/lib/utils";
import type { NavAction } from "./types";

export default function BackofficeTopNav({
  items,
  pathname,
}: {
  items: NavAction[];
  pathname: string;
}) {
  return (
    <nav className="hidden flex-1 items-center justify-center gap-2 lg:flex">
      {items.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "group inline-flex h-11 items-center gap-2 rounded-full border px-2.5 pr-4 text-sm font-medium transition",
              isActive
                ? "border-foreground bg-foreground text-background shadow-sm"
                : "border-transparent bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <span
              className={cn(
                "grid size-8 place-items-center rounded-full transition",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "bg-background/70 text-muted-foreground group-hover:text-foreground"
              )}
            >
              <HugeiconsIcon icon={item.icon as never} size={17} strokeWidth={1.8} />
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
