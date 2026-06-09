"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { supabaseClient } from "@/lib/supabase/client";
import { useBrand } from "@/components/providers/brand-provider";

export default function SuspendedPage() {
  const router = useRouter();
  const { brandName } = useBrand();

  async function handleSignOut() {
    await supabaseClient.auth.signOut();
    router.replace("/login");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-destructive/10">
          <svg
            className="size-7 text-destructive"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.8}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-foreground">Account Suspended</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {brandName} access has been temporarily suspended. Please contact your account manager or reach out to support to resolve any outstanding issues.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Button variant="destructive" className="rounded-full" onClick={handleSignOut}>
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}
