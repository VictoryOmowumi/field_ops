"use client";

import { useState } from "react";
import { useTenantExperience } from "@/components/providers/tenant-experience-provider";

const STORAGE_KEY = "actiq_tenant_experience";

export default function TenantDebugPanel() {
  if (process.env.NODE_ENV === "production") return null;

  return <DebugPanelInner />;
}

function DebugPanelInner() {
  const [open, setOpen] = useState(false);
  const { config, orgSlug, loading } = useTenantExperience();

  function clearCache() {
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
      window.location.reload();
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-[9999] font-mono text-xs">
      {open ? (
        <div className="w-80 rounded-2xl border border-border bg-background shadow-xl ring-1 ring-border/40">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="font-semibold text-foreground">Tenant Experience</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          </div>
          <div className="space-y-3 p-4">
            <Row label="Org slug" value={orgSlug ?? "(none)"} />
            <Row label="Loading" value={String(loading)} />
            <Row label="Shell" value={config.layout.shellVariant} />
            <Row label="Dashboard" value={config.dashboards.variant} />
            <Row label="Color preset" value={config.theme.colorPreset} />

            <div>
              <p className="mb-1 text-muted-foreground">Terminology overrides</p>
              {Object.entries(config.terminology).map(([key, value]) => (
                <Row key={key} label={key} value={value ?? ""} indent />
              ))}
            </div>

            <div>
              <p className="mb-1 text-muted-foreground">Modules</p>
              {Object.entries(config.modules).map(([key, value]) => (
                <Row
                  key={key}
                  label={key}
                  value={value !== false ? "enabled" : "disabled"}
                  valueClass={value !== false ? "text-primary" : "text-destructive"}
                  indent
                />
              ))}
            </div>

            <div>
              <p className="mb-1 text-muted-foreground">Cache</p>
              <div className="rounded-xl bg-muted px-3 py-2 text-muted-foreground">
                key: {STORAGE_KEY}
              </div>
            </div>
          </div>
          <div className="border-t border-border px-4 py-3">
            <button
              type="button"
              onClick={clearCache}
              className="w-full rounded-xl bg-destructive/10 px-3 py-2 text-destructive hover:bg-destructive/20"
            >
              Clear cache + reload
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full border border-border bg-background px-3 py-2 shadow-lg hover:bg-muted"
          title="Tenant Experience Debug"
        >
          ⚙ TEE
        </button>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  indent,
  valueClass,
}: {
  label: string;
  value: string;
  indent?: boolean;
  valueClass?: string;
}) {
  return (
    <div className={`flex items-start justify-between gap-2 ${indent ? "pl-2" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className={`max-w-36 truncate text-right font-medium ${valueClass ?? "text-foreground"}`}>
        {value}
      </span>
    </div>
  );
}
