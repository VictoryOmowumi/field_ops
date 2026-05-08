"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { supabaseClient } from "@/lib/supabase/client";

type Org = { id: string; name: string; status: string };
type UsageRow = { metric: string; value: string };

export default function OrganizationUsagePage() {
  const params = useParams<{ id: string }>();
  const orgId = params.id;
  const [org, setOrg] = useState<Org | null>(null);
  const [usage, setUsage] = useState<UsageRow[]>([]);

  useEffect(() => {
    async function load() {
      const { data } = await supabaseClient.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const [orgRes, usageRes] = await Promise.all([
        fetch(`/api/platform/organizations/${orgId}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/platform/organizations/${orgId}/usage`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const orgJson = (await orgRes.json()) as { success: boolean; organization?: { id: string; name: string; status: string } };
      const usageJson = (await usageRes.json()) as { success: boolean; usage?: UsageRow[]; message?: string };
      if (orgRes.ok && orgJson.success && orgJson.organization) {
        setOrg({ id: orgJson.organization.id, name: orgJson.organization.name, status: orgJson.organization.status });
      }
      if (usageRes.ok && usageJson.success) {
        setUsage(usageJson.usage ?? []);
      } else {
        toast.error(usageJson.message ?? "Failed to load usage.");
      }
    }
    void load();
  }, [orgId]);

  if (!org) return <div className="rounded-3xl border border-border p-4 text-sm text-muted-foreground">Loading organization usage...</div>;

  return (
    <div className="space-y-6 pb-10">
      <div>
        <div className="mb-2 flex items-center gap-2"><Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/10">{org.status}</Badge><span className="text-sm text-muted-foreground">{org.id}</span></div>
        <h1 className="text-2xl font-semibold tracking-tight">{org.name} Usage</h1>
      </div>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {usage.map((item) => (<article key={item.metric} className="rounded-3xl bg-card p-5 shadow-sm ring-1 ring-border/60"><p className="text-xs text-muted-foreground">{item.metric}</p><p className="mt-2 text-2xl font-semibold">{item.value}</p></article>))}
      </section>
    </div>
  );
}

