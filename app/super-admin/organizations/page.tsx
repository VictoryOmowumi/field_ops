"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabaseClient } from "@/lib/supabase/client";

type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  status: string;
  plan: string;
  campaignCount?: number;
};

function toTitleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function SuperAdminOrganizationsPage() {
  const [organizations, setOrganizations] = useState<OrganizationRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadOrganizations() {
      const { data } = await supabaseClient.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setLoading(false);
        toast.error("Session expired. Please sign in again.");
        return;
      }

      const response = await fetch("/api/platform/organizations", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const result = (await response.json()) as {
        success: boolean;
        message?: string;
        organizations?: OrganizationRow[];
      };

      setLoading(false);

      if (!response.ok || !result.success) {
        toast.error(result.message ?? "Failed to load organizations.");
        return;
      }

      setOrganizations(result.organizations ?? []);
    }

    void loadOrganizations();
  }, []);

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Organizations</h1>
          <p className="mt-1 text-sm text-muted-foreground">Tenant onboarding, status control, and workspace visibility.</p>
        </div>
        <Button className="rounded-full" asChild>
          <Link href="/super-admin/organizations/new">Create Organization</Link>
        </Button>
      </div>

      <section className="overflow-hidden rounded-3xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Org ID</th>
              <th className="px-4 py-3 text-left font-medium">Organization</th>
              <th className="px-4 py-3 text-left font-medium">Industry</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Plan</th>
              <th className="px-4 py-3 text-left font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className="border-t border-border">
                <td className="px-4 py-6 text-muted-foreground" colSpan={6}>Loading organizations...</td>
              </tr>
            ) : organizations.length === 0 ? (
              <tr className="border-t border-border">
                <td className="px-4 py-6 text-muted-foreground" colSpan={6}>No organizations yet.</td>
              </tr>
            ) : (
              organizations.map((org) => (
                <tr key={org.id} className="border-t border-border">
                  <td className="px-4 py-4 text-muted-foreground">{org.id}</td>
                  <td className="px-4 py-4">
                    <p className="font-medium">{org.name}</p>
                    <p className="text-xs text-muted-foreground">{org.slug}</p>
                  </td>
                  <td className="px-4 py-4 text-muted-foreground">{org.industry ?? "-"}</td>
                  <td className="px-4 py-4">
                    <Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/10">{toTitleCase(org.status)}</Badge>
                  </td>
                  <td className="px-4 py-4 text-muted-foreground">{toTitleCase(org.plan)}</td>
                  <td className="px-4 py-4">
                    <Button variant="outline" className="rounded-full" asChild>
                      <Link href={`/super-admin/organizations/${org.id}`}>View</Link>
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
