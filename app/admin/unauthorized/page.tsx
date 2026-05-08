"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function AdminUnauthorizedPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 rounded-4xl bg-card p-8 ring-1 ring-border/60">
      <h1 className="text-2xl font-semibold tracking-tight">Unauthorized Action</h1>
      <p className="text-sm text-muted-foreground">
        Your current role can view this area, but you do not have permission to perform this action.
      </p>
      <div className="flex gap-2">
        <Button asChild className="rounded-full">
          <Link href="/admin/dashboard">Go to Dashboard</Link>
        </Button>
        <Button asChild variant="outline" className="rounded-full">
          <Link href="/admin/reports">Open Reports</Link>
        </Button>
      </div>
    </main>
  );
}

