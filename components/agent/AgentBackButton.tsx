"use client";

import Link from "next/link";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";

export default function AgentBackButton({ href = "/agent/home", label = "Back" }: { href?: string; label?: string }) {
  return (
    <Button asChild variant="ghost" className="h-8 rounded-full px-2 text-xs">
      <Link href={href}>
        <HugeiconsIcon icon={ArrowLeft01Icon} size={14} strokeWidth={2} />
        <span>{label}</span>
      </Link>
    </Button>
  );
}

