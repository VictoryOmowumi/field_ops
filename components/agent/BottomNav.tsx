"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  Home01Icon,
  ReloadIcon,
  SaleTag01Icon,
  Store01Icon,
  User03Icon,
} from "@hugeicons/core-free-icons";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const navItems = [
  { href: "/agent/home", label: "Home", icon: Home01Icon },
  { href: "/agent/outlets", label: "Outlets", icon: Store01Icon },
  { href: "/agent/sales", label: "Sell", icon: SaleTag01Icon, accent: true },
  { href: "/agent/sync", label: "Sync", icon: ReloadIcon },
  { href: "/agent/profile", label: "Profile", icon: User03Icon },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md">
      <div className="pointer-events-auto grid grid-cols-5 items-end border-t bg-background/95 px-2 py-2">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/agent/home" &&
              pathname.startsWith(`${item.href}/`));

          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center justify-center gap-1 py-1"
              aria-current={isActive ? "page" : undefined}
            >
              <span
                className={cn(
                  "flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors",
                  isActive && "bg-muted text-foreground",
                  item.accent && "size-14 text-white bg-primary drop-shadow-2xl shadow-primary/50",
                  item.accent && isActive && "bg-red-500 text-red-foreground",
                )}
              >
                <HugeiconsIcon icon={item.icon} size={item.accent ? 24 : 16} strokeWidth={1.2} />
              </span>
              {item.accent ? null : (
                <span
                  className={cn(
                    "text-[11px] font-medium leading-none text-muted-foreground",
                    isActive && "text-foreground",
                  )}
                >
                  {item.label}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
