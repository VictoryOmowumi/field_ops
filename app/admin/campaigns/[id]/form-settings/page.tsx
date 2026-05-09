"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabaseClient } from "@/lib/supabase/client";

const settingDefs = [
  { key: "requireOutletPhone", label: "Require outlet phone" },
  { key: "requireGps", label: "Require GPS capture" },
  { key: "requirePhotoEvidence", label: "Require photo evidence" },
  { key: "requireProductQuantity", label: "Require product quantity" },
  { key: "requireSalesValue", label: "Require sales value" },
  { key: "allowNotes", label: "Allow notes" },
  { key: "allowRevisitStatus", label: "Allow revisit status" },
  { key: "requirePosmDeployment", label: "Capture POSM deployment" },
  { key: "requirePosmQuantityWhenDeployed", label: "Require POSM quantity (when yes)" },
];

export default function CampaignFormSettingsPage() {
  const params = useParams<{ id: string }>();
  const campaignId = params.id;
  const [settings, setSettings] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const { data } = await supabaseClient.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const response = await fetch(`/api/admin/campaigns/${campaignId}`, { headers: { Authorization: `Bearer ${token}` } });
      const result = await response.json();
      setLoading(false);
      if (!response.ok || !result.success || !result.campaign) return;
      setSettings(result.campaign.form_requirements ?? {});
    }
    void load();
  }, [campaignId]);

  async function save() {
    setSaving(true);
    const { data } = await supabaseClient.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    const response = await fetch(`/api/admin/campaigns/${campaignId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ formRequirements: settings }),
    });
    const result = await response.json();
    setSaving(false);
    if (!response.ok || !result.success) {
      toast.error(result.message ?? "Failed to save form settings.");
      return;
    }
    toast.success("Form settings updated.");
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Form Requirements</h1>
          <p className="mt-1 text-sm text-muted-foreground">Field data rules applied to agent capture forms.</p>
        </div>
        <Button variant="outline" className="rounded-full" asChild><Link href={`/admin/campaigns/${campaignId}`}>Back to Campaign</Link></Button>
      </div>
      <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        {loading ? <p className="text-sm text-muted-foreground">Loading settings...</p> : null}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {settingDefs.map((item) => (
            <div key={item.key} className="rounded-3xl bg-muted/35 p-4">
              <p className="text-sm text-muted-foreground">{item.label}</p>
              <Button type="button" size="sm" variant={settings[item.key] ? "default" : "outline"} className="mt-2 rounded-full" onClick={() => setSettings((prev) => ({ ...prev, [item.key]: !prev[item.key] }))}>
                {settings[item.key] ? "Required" : "Optional"}
              </Button>
            </div>
          ))}
        </div>
        <div className="mt-5 flex justify-end">
          <Button className="rounded-full px-6" disabled={saving} onClick={save}>{saving ? "Saving..." : "Save Settings"}</Button>
        </div>
      </section>
    </div>
  );
}
