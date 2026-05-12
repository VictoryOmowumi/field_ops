"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabaseClient } from "@/lib/supabase/client";

export default function AgentSessionMenu({
  fullName,
  roleLabel,
}: {
  fullName?: string;
  roleLabel?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [organizationName, setOrganizationName] = useState("");

  useEffect(() => {
    let active = true;

    async function loadOrganizationName() {
      const { data } = await supabaseClient.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;

      const response = await fetch("/api/auth/context", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return;

      const result = (await response.json()) as {
        success: boolean;
        user?: {
          memberships?: Array<{ status?: string; organizations?: { name?: string | null } }>;
        };
      };
      const activeMembership = (result.user?.memberships ?? []).find((m) => m.status === "active")
        ?? (result.user?.memberships ?? [])[0];
      if (active) setOrganizationName(activeMembership?.organizations?.name ?? "");
    }

    void loadOrganizationName();
    return () => {
      active = false;
    };
  }, []);

  async function signOut() {
    setLoading(true);
    const { error } = await supabaseClient.auth.signOut();
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    router.replace("/login");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" className="rounded-full w-9 h-9 flex items-center font-semibold justify-center p-2">
          {fullName?.split(" ").map((n) => n[0]).join("").toUpperCase() ?? null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <p className="font-medium">{fullName ?? "Agent"}</p>
          <p className="text-xs text-muted-foreground">{roleLabel ?? "Field Agent"}</p>
          {organizationName ? <p className="text-xs text-muted-foreground">{organizationName}</p> : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/agent/profile">View Profile</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={loading} onClick={signOut}>
          {loading ? "Signing out..." : "Sign Out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
