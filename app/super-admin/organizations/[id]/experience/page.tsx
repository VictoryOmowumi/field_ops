"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabaseClient } from "@/lib/supabase/client";
import {
  DEFAULT_TENANT_EXPERIENCE_CONFIG,
  type ModuleKey,
  type TenantColorPreset,
  type TenantExperienceConfigOverrides,
  type TerminologyKey,
  type UiVariant,
} from "@/lib/tenant-experience/types";
import { resolveTenantExperienceConfig } from "@/lib/tenant-experience/resolve";

// ---- local types ----

type ShellOption = { value: string; label: string; description: string };
type DashboardOption = { value: string; label: string; description: string };

const SHELL_OPTIONS: ShellOption[] = [
  { value: "backoffice-default", label: "Top Nav", description: "Horizontal navigation bar. Classic platform look." },
  { value: "sidebar", label: "Sidebar", description: "Left sidebar with minimal top bar. Modern SaaS layout." },
  { value: "command-rail", label: "Command Rail", description: "Icon-only left rail with tooltips. Dense, command-center feel." },
];

const DASHBOARD_OPTIONS: DashboardOption[] = [
  { value: "operational", label: "Operational", description: "Visit trends, outlet coverage, activity feed." },
  { value: "command-center", label: "Command Center", description: "Campaign intelligence, activation velocity, leaderboard." },
];

const UI_VARIANT_OPTIONS: { value: UiVariant; label: string; description: string }[] = [
  { value: "classic", label: "Classic", description: "Standard neutral layout. Existing tenants — no brand colors on the shared view." },
  { value: "enhanced", label: "Enhanced", description: "Branded shared view with tenant colors, hero section, KPI pills, and tabbed campaign layout." },
];

const COLOR_PRESETS: { value: TenantColorPreset; label: string; light: string; dark: string }[] = [
  { value: "default", label: "Warm Orange", light: "bg-[#d4712a]", dark: "bg-[#c4621a]" },
  { value: "blue",    label: "Corporate Blue", light: "bg-[#2563eb]", dark: "bg-[#3b82f6]" },
  { value: "green",   label: "Corporate Green", light: "bg-[#16a34a]", dark: "bg-[#22c55e]" },
  { value: "purple",  label: "Violet", light: "bg-[#7c3aed]", dark: "bg-[#8b5cf6]" },
  { value: "slate",   label: "Slate Blue", light: "bg-[#475569]", dark: "bg-[#64748b]" },
  { value: "red",     label: "Bold Red", light: "bg-[#dc2626]", dark: "bg-[#ef4444]" },
  { value: "teal",    label: "Teal", light: "bg-[#0d9488]", dark: "bg-[#14b8a6]" },
  { value: "amber",   label: "Amber / Gold", light: "bg-[#d97706]", dark: "bg-[#f59e0b]" },
  { value: "rose",    label: "Rose / Pink", light: "bg-[#e11d48]", dark: "bg-[#f43f5e]" },
  { value: "navy",    label: "Deep Navy", light: "bg-[#1e3a5f]", dark: "bg-[#334155]" },
];

const MODULE_LABELS: Record<ModuleKey, string> = {
  outlets:          "Outlets / Store Management",
  posm:             "POSM / Display Units",
  salesTracking:    "Sales Tracking",
  freeSampling:     "Free Sampling",
  evidenceGallery:  "Evidence Gallery",
  reports:          "Reports",
  maps:             "Territory Maps",
  agentPerformance: "Agent / Rep Performance",
  supervisorReview: "Supervisor Review",
};

const TERMINOLOGY_LABELS: Record<TerminologyKey, string> = {
  outlet:      "Outlet (singular)",
  outlets:     "Outlets (plural)",
  agent:       "Agent / Rep (singular)",
  agents:      "Agents / Reps (plural)",
  campaign:    "Campaign (singular)",
  campaigns:   "Campaigns (plural)",
  conversion:  "Conversion (singular)",
  conversions: "Conversions (plural)",
  visit:       "Visit (singular)",
  visits:      "Visits (plural)",
  supervisor:  "Supervisor (singular)",
  supervisors: "Supervisors (plural)",
  outletType:  "Outlet Type label",
  posm:        "POSM label",
  freeSample:  "Free Sample label",
  evidence:    "Evidence label",
};

// ---- helpers ----

function authorizedFetch(url: string, options?: RequestInit) {
  return supabaseClient.auth.getSession().then(({ data }) => {
    const token = data.session?.access_token;
    return fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options?.headers ?? {}),
      },
    });
  });
}

// ---- page ----

export default function TenantExperiencePage() {
  const params = useParams<{ id: string }>();
  const orgId = params.id;

  const [orgName, setOrgName] = useState<string>("");
  const [overrides, setOverrides] = useState<TenantExperienceConfigOverrides>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // resolved config = defaults merged with current overrides (live preview)
  const resolved = resolveTenantExperienceConfig(overrides);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await authorizedFetch(`/api/platform/organizations/${orgId}/experience-config`);
        const payload = (await res.json()) as {
          success: boolean;
          experienceConfig?: TenantExperienceConfigOverrides;
          message?: string;
        };
        if (!res.ok || !payload.success) {
          toast.error(payload.message ?? "Failed to load config.");
          return;
        }
        setOverrides(payload.experienceConfig ?? {});

        // also load org name for the header
        const orgRes = await authorizedFetch(`/api/platform/organizations/${orgId}`);
        const orgPayload = (await orgRes.json()) as {
          success: boolean;
          organization?: { name: string };
        };
        if (orgPayload.success && orgPayload.organization?.name) {
          setOrgName(orgPayload.organization.name);
        }
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [orgId]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await authorizedFetch(
        `/api/platform/organizations/${orgId}/experience-config`,
        { method: "PATCH", body: JSON.stringify(overrides) }
      );
      const payload = (await res.json()) as { success: boolean; message?: string };
      if (!res.ok || !payload.success) {
        toast.error(payload.message ?? "Failed to save config.");
        return;
      }
      toast.success("Tenant experience config saved.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function setColorPreset(preset: TenantColorPreset) {
    setOverrides((prev) => ({ ...prev, theme: { ...prev.theme, colorPreset: preset } }));
  }

  function setFontUrl(url: string) {
    const val = url.trim() || null;
    setOverrides((prev) => ({ ...prev, theme: { ...prev.theme, fontUrl: val } }));
  }

  function setShellVariant(variant: string) {
    setOverrides((prev) => ({ ...prev, layout: { ...prev.layout, shellVariant: variant as never } }));
  }

  function setDashboardVariant(variant: string) {
    setOverrides((prev) => ({ ...prev, dashboards: { ...prev.dashboards, variant: variant as never } }));
  }

  function setUiVariant(variant: UiVariant) {
    setOverrides((prev) => ({ ...prev, layout: { ...prev.layout, uiVariant: variant } }));
  }

  function setModule(key: ModuleKey, enabled: boolean) {
    setOverrides((prev) => ({ ...prev, modules: { ...prev.modules, [key]: enabled } }));
  }

  function setTerminology(key: TerminologyKey, value: string) {
    setOverrides((prev) => ({
      ...prev,
      terminology: {
        ...prev.terminology,
        [key]: value || DEFAULT_TENANT_EXPERIENCE_CONFIG.terminology[key],
      },
    }));
  }

  if (loading) {
    return (
      <div className="flex min-h-60 items-center justify-center text-sm text-muted-foreground">
        Loading experience config…
      </div>
    );
  }

  const activePreset = resolved.theme.colorPreset;
  const activeFontUrl = resolved.theme.fontUrl ?? "";
  const activeShell = resolved.layout.shellVariant;
  const activeDashboard = resolved.dashboards.variant;
  const activeUiVariant = resolved.layout.uiVariant;

  return (
    <div className="space-y-8 pb-16">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{orgName}</p>
          <h1 className="text-3xl font-semibold tracking-tight">Tenant Experience</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure how this organization&apos;s workspace looks and behaves.
            Changes take effect after the user clears their browser cache.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="rounded-full" asChild>
            <Link href={`/super-admin/organizations/${orgId}`}>Back to Org</Link>
          </Button>
          <Button className="rounded-full px-6" disabled={saving} onClick={() => void handleSave()}>
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </div>

      {/* ── Color Preset ── */}
      <Section title="Brand Color" description="Sets the primary accent color across nav, buttons, badges, and charts.">
        <div className="flex flex-wrap gap-3">
          {COLOR_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => setColorPreset(preset.value)}
              className={`group flex flex-col items-center gap-2 rounded-2xl border p-4 text-sm transition-all ${
                activePreset === preset.value
                  ? "border-primary bg-primary/5 ring-2 ring-primary"
                  : "border-border hover:border-primary/40 hover:bg-muted/50"
              }`}
            >
              <span className={`size-8 rounded-full ${preset.light} shadow-sm ring-1 ring-border/40`} />
              <span className="font-medium">{preset.label}</span>
              {activePreset === preset.value && (
                <Badge className="rounded-full bg-primary/10 text-primary text-xs hover:bg-primary/10">Active</Badge>
              )}
            </button>
          ))}
        </div>
      </Section>

      {/* ── Font ── */}
      <Section
        title="Typeface"
        description="Paste a Google Fonts CSS2 URL. Leave blank to use the platform default (Outfit)."
      >
        <div className="space-y-3">
          <Input
            value={activeFontUrl}
            placeholder="https://fonts.googleapis.com/css2?family=Manrope:wght@200..800&display=swap"
            className="rounded-xl font-mono text-xs"
            onChange={(e) => setFontUrl(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Go to{" "}
            <a
              href="https://fonts.google.com"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-2"
            >
              fonts.google.com
            </a>
            , select a font, click <strong>Get embed code</strong>, copy the{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">@import</code> URL.
            Multiple families in one URL are supported — the first family becomes the
            workspace font.
          </p>
          {activeFontUrl && (
            <div className="rounded-2xl border border-border bg-muted/30 p-4">
              <p className="mb-1 text-xs text-muted-foreground">Preview (after save + cache clear):</p>
              <p
                className="text-2xl font-semibold text-foreground"
                style={{ fontFamily: `'${activeFontUrl.match(/family=([^:&]+)/)?.[1]?.replace(/\+/g, " ") ?? "inherit"}', sans-serif` }}
              >
                The quick brown fox jumps over the lazy dog
              </p>
            </div>
          )}
        </div>
      </Section>

      {/* ── Shell Layout ── */}
      <Section title="Navigation Layout" description="Controls the overall shell — where the nav lives and how it looks.">
        <div className="grid gap-3 sm:grid-cols-3">
          {SHELL_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setShellVariant(opt.value)}
              className={`rounded-2xl border p-4 text-left transition-all ${
                activeShell === opt.value
                  ? "border-primary bg-primary/5 ring-2 ring-primary"
                  : "border-border hover:border-primary/40 hover:bg-muted/50"
              }`}
            >
              <p className="font-semibold">{opt.label}</p>
              <p className="mt-1 text-sm text-muted-foreground">{opt.description}</p>
              {activeShell === opt.value && (
                <Badge className="mt-2 rounded-full bg-primary/10 text-primary text-xs hover:bg-primary/10">Active</Badge>
              )}
            </button>
          ))}
        </div>
      </Section>

      {/* ── Dashboard Variant ── */}
      <Section title="Dashboard Variant" description="Controls the information architecture of the main dashboard.">
        <div className="grid gap-3 sm:grid-cols-2">
          {DASHBOARD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setDashboardVariant(opt.value)}
              className={`rounded-2xl border p-4 text-left transition-all ${
                activeDashboard === opt.value
                  ? "border-primary bg-primary/5 ring-2 ring-primary"
                  : "border-border hover:border-primary/40 hover:bg-muted/50"
              }`}
            >
              <p className="font-semibold">{opt.label}</p>
              <p className="mt-1 text-sm text-muted-foreground">{opt.description}</p>
              {activeDashboard === opt.value && (
                <Badge className="mt-2 rounded-full bg-primary/10 text-primary text-xs hover:bg-primary/10">Active</Badge>
              )}
            </button>
          ))}
        </div>
      </Section>

      {/* ── Shared / Public View UI Variant ── */}
      <Section
        title="Shared Campaign View"
        description="Controls the layout and branding of campaign reports shared with external stakeholders (clients, partners). Classic is the default — existing tenants are unaffected."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {UI_VARIANT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setUiVariant(opt.value)}
              className={`rounded-2xl border p-4 text-left transition-all ${
                activeUiVariant === opt.value
                  ? "border-primary bg-primary/5 ring-2 ring-primary"
                  : "border-border hover:border-primary/40 hover:bg-muted/50"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">{opt.label}</p>
                {opt.value === "enhanced" && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">New</span>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{opt.description}</p>
              {activeUiVariant === opt.value && (
                <Badge className="mt-2 rounded-full bg-primary/10 text-primary text-xs hover:bg-primary/10">Active</Badge>
              )}
            </button>
          ))}
        </div>
      </Section>

      {/* ── Modules ── */}
      <Section title="Modules" description="Disable modules to hide them from the nav and protect their routes.">
        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(MODULE_LABELS) as ModuleKey[]).map((key) => {
            const enabled = resolved.modules[key] !== false;
            return (
              <label
                key={key}
                className={`flex cursor-pointer items-center justify-between rounded-2xl border p-4 transition-colors ${
                  enabled ? "border-primary/30 bg-primary/5" : "border-border bg-muted/30"
                }`}
              >
                <div>
                  <p className="text-sm font-medium">{MODULE_LABELS[key]}</p>
                  <p className="text-xs text-muted-foreground">{key}</p>
                </div>
                <div className="relative">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={enabled}
                    onChange={(e) => setModule(key, e.target.checked)}
                  />
                  <div
                    className={`h-6 w-10 rounded-full transition-colors ${enabled ? "bg-primary" : "bg-muted"}`}
                    onClick={() => setModule(key, !enabled)}
                  >
                    <div
                      className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform ${
                        enabled ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </Section>

      {/* ── Terminology ── */}
      <Section
        title="Terminology"
        description="Override how the platform refers to core concepts. Leave blank to use the platform default."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {(Object.keys(TERMINOLOGY_LABELS) as TerminologyKey[]).map((key) => {
            const defaultVal = DEFAULT_TENANT_EXPERIENCE_CONFIG.terminology[key] ?? key;
            const currentVal = resolved.terminology[key] ?? defaultVal;
            const isOverridden = currentVal !== defaultVal;
            return (
              <div key={key}>
                <label className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  {TERMINOLOGY_LABELS[key]}
                  {isOverridden && (
                    <Badge className="rounded-full bg-primary/10 text-primary text-[10px] hover:bg-primary/10">
                      Custom
                    </Badge>
                  )}
                </label>
                <Input
                  value={currentVal}
                  placeholder={defaultVal}
                  className="rounded-xl"
                  onChange={(e) => setTerminology(key, e.target.value)}
                />
                <p className="mt-1 text-[10px] text-muted-foreground">Default: {defaultVal}</p>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Save footer */}
      <div className="flex justify-end gap-3 border-t border-border pt-6">
        <Button variant="outline" className="rounded-full" asChild>
          <Link href={`/super-admin/organizations/${orgId}`}>Cancel</Link>
        </Button>
        <Button className="rounded-full px-8" disabled={saving} onClick={() => void handleSave()}>
          {saving ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-4xl bg-card p-6 shadow-sm ring-1 ring-border/60">
      <div className="mb-5">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}
