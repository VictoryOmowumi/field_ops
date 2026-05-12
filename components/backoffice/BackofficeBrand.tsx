"use client";

import Link from "next/link";
import { useBrand } from "@/components/providers/brand-provider";
export default function BackofficeBrand({ homeHref }: { homeHref: string }) {
  const { brandName, logoUrl } = useBrand();
  return (
    <Link href={homeHref} className="flex shrink-0 items-center gap-2">
      {logoUrl ? (
        <span className="inline-flex items-center rounded-full bg-white ">
          <img src={logoUrl} alt={`${brandName} logo`} className="h-12 w-auto max-w-40 object-cover" />
        </span>
      ) : 
      <span className="text-xl font-semibold tracking-tight text-foreground">{brandName}</span>
      }
    </Link>
  );
}
