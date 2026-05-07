import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type ActionTileProps = {
  title: string;
  href: string;
  icon: ReactNode;
  accent?: "orange" | "green" | "amber" | "rose";
};

const styles = {
  orange: "bg-orange-500/5 border-orange-500/10 text-orange-600",
  green: "bg-emerald-500/5 border-emerald-500/10 text-emerald-600",
  amber: "bg-amber-500/5 border-amber-500/10 text-amber-600",
  rose: "bg-rose-500/5 border-rose-500/10 text-rose-600",
};

export default function ActionTile({ title, href, icon, accent = "orange" }: ActionTileProps) {
  return (
    <Link
      href={href}
      className={cn(
        "flex flex-col items-center justify-center gap-3 aspect-square rounded-[2rem] border transition-all active:scale-95",
        styles[accent]
      )}
    >
      <div className="size-12 rounded-2xl bg-background/80 shadow-sm flex items-center justify-center">
        {icon}
      </div>
      <span className="text-xs font-bold tracking-tight">{title}</span>
    </Link>
  );
}