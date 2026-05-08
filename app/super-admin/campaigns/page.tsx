"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabaseClient } from "@/lib/supabase/client";
import type { PlatformCampaignRow } from "@/types/platform";

export default function SuperAdminCampaignsPage() {
  const [campaigns, setCampaigns] = useState<PlatformCampaignRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadCampaigns() {
      const { data } = await supabaseClient.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setLoading(false);
        toast.error("Session expired. Please sign in again.");
        return;
      }
      const response = await fetch("/api/platform/campaigns", { headers: { Authorization: `Bearer ${token}` } });
      const result = (await response.json()) as { success: boolean; message?: string; campaigns?: PlatformCampaignRow[] };
      setLoading(false);
      if (!response.ok || !result.success) {
        toast.error(result.message ?? "Failed to load campaigns.");
        return;
      }
      setCampaigns(result.campaigns ?? []);
    }
    void loadCampaigns();
  }, []);

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Campaign Ops</h1>
          <p className="mt-1 text-sm text-muted-foreground">Cross-tenant campaign governance and rollout oversight.</p>
        </div>
      </div>

      <section className="overflow-hidden rounded-3xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-medium">ID</th>
              <th className="px-4 py-3 text-left">Organization</th>
              <th className="px-4 py-3 text-left">Campaign</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Sync Health</th>
              <th className="px-4 py-3 text-left">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className="border-t border-border"><td className="px-4 py-4 text-muted-foreground" colSpan={6}>Loading campaigns...</td></tr>
            ) : campaigns.length === 0 ? (
              <tr className="border-t border-border"><td className="px-4 py-4 text-muted-foreground" colSpan={6}>No campaigns found.</td></tr>
            ) : campaigns.map((item) => (
              <tr key={item.id} className="border-t border-border">
                <td className="px-4 py-4 text-muted-foreground">#{item.id.slice(0, 8)}</td>
                <td className="px-4 py-4 font-medium">{item.organization}</td>
                <td className="px-4 py-4">{item.campaign}</td>
                <td className="px-4 py-4">{item.status}</td>
                <td className="px-4 py-4">{item.sync}</td>
                <td className="px-4 py-4">
                  <Button variant="outline" className="rounded-full" asChild>
                    <Link href={`/super-admin/campaigns/${item.id}`}>View</Link>
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

