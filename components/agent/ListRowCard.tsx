import type { ReactNode } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

type ListRowCardProps = {
  title: string;
  subtitle?: string;
  meta?: string;
  trailing?: ReactNode;
  leading?: ReactNode;
  className?: string;
  href?: string;
};

export default function ListRowCard({
  title,
  subtitle,
  meta,
  trailing,
  leading,
  className,
  href,
}: ListRowCardProps) {
  const content = (
    <div
      className={cn(
        "flex items-start justify-between gap-3 rounded-2xl border border-border/70 bg-card p-3 shadow-sm",
        className
      )}
    >
      <div className="flex min-w-0 items-start gap-2">
        {leading ? (
          <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            {leading}
          </span>
        ) : null}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{title}</p>
          {subtitle ? (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{subtitle}</p>
          ) : null}
          {meta ? <p className="mt-1 text-[11px] text-muted-foreground">{meta}</p> : null}
        </div>
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );

  if (!href) return content;

  return (
    <Link href={href} className="block">
      {content}
    </Link>
  );
}
