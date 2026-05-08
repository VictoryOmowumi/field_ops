"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabaseClient } from "@/lib/supabase/client";
import type { PlatformSettingItem } from "@/types/platform";

export default function SuperAdminSettingsPage() {
  const [settings, setSettings] = useState<PlatformSettingItem[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadSettings() {
      const { data } = await supabaseClient.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setLoading(false);
        toast.error("Session expired. Please sign in again.");
        return;
      }
      const response = await fetch("/api/platform/settings", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = (await response.json()) as { success: boolean; message?: string; settings?: PlatformSettingItem[] };
      setLoading(false);
      if (!response.ok || !result.success) {
        toast.error(result.message ?? "Failed to load settings.");
        return;
      }
      const rows = result.settings ?? [];
      setSettings(rows);
      setDraft(Object.fromEntries(rows.map((row) => [row.key, row.value])));
    }
    void loadSettings();
  }, []);

  async function save() {
    setSaving(true);
    const { data } = await supabaseClient.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setSaving(false);
      toast.error("Session expired. Please sign in again.");
      return;
    }
    const items = settings.map((row) => ({ key: row.key, value: draft[row.key] ?? row.value }));
    const response = await fetch("/api/platform/settings", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ items }),
    });
    const result = (await response.json()) as { success: boolean; message?: string };
    setSaving(false);
    if (!response.ok || !result.success) {
      toast.error(result.message ?? "Failed to save settings.");
      return;
    }
    setSettings((prev) => prev.map((row) => ({ ...row, value: draft[row.key] ?? row.value })));
    setEditing(false);
    toast.success("Platform settings updated.");
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Platform Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">Global defaults for sync reliability and tenant operations.</p>
        </div>
        {editing ? (
          <div className="flex gap-2">
            <Button variant="outline" className="rounded-full" onClick={() => setEditing(false)}>Cancel</Button>
            <Button className="rounded-full" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save Settings"}</Button>
          </div>
        ) : (
          <Button className="rounded-full" onClick={() => setEditing(true)}>Edit Settings</Button>
        )}
      </div>

      <section className="overflow-hidden rounded-3xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Section</th>
              <th className="px-4 py-3 text-left">Setting</th>
              <th className="px-4 py-3 text-left">Current Value</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className="border-t border-border"><td className="px-4 py-4 text-muted-foreground" colSpan={3}>Loading settings...</td></tr>
            ) : settings.map((item) => (
              <tr key={item.key} className="border-t border-border">
                <td className="px-4 py-4 font-medium">{item.section}</td>
                <td className="px-4 py-4 text-muted-foreground">{item.label}</td>
                <td className="px-4 py-4">
                  {editing ? (
                    <Input value={draft[item.key] ?? item.value} onChange={(event) => setDraft((prev) => ({ ...prev, [item.key]: event.target.value }))} />
                  ) : (
                    item.value
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

