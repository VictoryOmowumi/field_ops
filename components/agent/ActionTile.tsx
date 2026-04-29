import type { ReactNode } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

type ActionTileProps = {
  title: string;
  caption: string;
  href: string;
  icon: ReactNode;
  accent?: "blue" | "green" | "amber" | "rose";
};

const tileStyles = {
  blue: "border-sky-200/80 bg-sky-100 text-sky-950 dark:border-sky-900/60 dark:bg-sky-900/40 dark:text-sky-100",
  green:
    "border-emerald-200/80 bg-emerald-100 text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-900/45 dark:text-emerald-100",
  amber:
    "border-lime-300/80 bg-lime-300 text-lime-950 dark:border-lime-900/60 dark:bg-lime-900/55 dark:text-lime-100",
  rose: "border-rose-200/80 bg-rose-100 text-rose-950 dark:border-rose-900/60 dark:bg-rose-900/45 dark:text-rose-100",
};

const iconStyles = {
  blue: "bg-white/70 dark:bg-black/30",
  green: "bg-white/70 dark:bg-black/30",
  amber: "bg-white/70 dark:bg-black/30",
  rose: "bg-white/70 dark:bg-black/30",
};

export default function ActionTile({
  title,
  caption,
  href,
  icon,
  accent = "blue",
}: ActionTileProps) {
  return (
    <Link
      href={href}
      className={cn(
        "block rounded-2xl border p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
        tileStyles[accent]
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "inline-flex size-8 items-center justify-center rounded-full",
            iconStyles[accent]
          )}
        >
          {icon}
        </span>
      </div>
      <p className="mt-4 text-sm font-semibold">{title}</p>
      <p className="text-xs opacity-80">{caption}</p>
    </Link>
  );
}
