"use client";

import Link from "next/link";
import { useBrand } from "@/components/providers/brand-provider";
export default function BackofficeBrand({ homeHref }: { homeHref: string }) {
  const { brandName, logoUrl } = useBrand();
  return (
    <Link href={homeHref} className="flex shrink-0 items-center gap-2">
      {logoUrl ? (
        <span className="inline-flex items-center rounded-md border border-border/70 bg-taupe-800 dark:bg-transparent! p-1.5 shadow-xs">
          <img src={logoUrl} alt={`${brandName} logo`} className="h-8 w-auto max-w-40 object-contain" />
        </span>
      ) : 
      <span className="text-xl font-semibold tracking-tight text-foreground">{brandName}</span>
      }
    </Link>
  );
}
