"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabaseClient } from "@/lib/supabase/client";

type FormState = {
  name: string;
  slug: string;
  industry: string;
  businessType: string;
  logoUrl: string;
  website: string;
  primaryContactEmail: string;
  primaryContactPhone: string;
  primaryAdminName: string;
  primaryAdminEmail: string;
  primaryAdminPhone: string;
  adminRole: string;
  country: string;
  timezone: string;
  currency: string;
  status: "trial" | "active" | "suspended" | "archived";
  plan: "starter" | "growth" | "enterprise";
  billingCycle: string;
  billingEmail: string;
  faviconIcoUrl: string;
  favicon16Url: string;
  favicon32Url: string;
  appleTouchIconUrl: string;
  android192Url: string;
  android512Url: string;
  manifestUrl: string;
};

type AssetType = "logo" | "favicon_ico" | "favicon_16" | "favicon_32" | "apple_touch" | "android_192" | "android_512" | "manifest";

const DRAFT_KEY = "activationiq:new-organization:draft";

const industries = ["FMCG", "Retail", "Trade Marketing", "Activation Agency", "Distribution", "Manufacturing"];
const businessTypes = ["Brand Owner", "Activation Agency", "Distributor", "Retail Chain", "Field Operations Team"];
const adminRoles = ["Organization Admin", "Campaign Manager", "Operations Manager", "Trade Marketing Manager", "Supervisor"];
const countries = ["Nigeria", "Ghana", "Kenya", "South Africa"];
const timezones = ["Africa/Lagos", "Africa/Accra", "Africa/Nairobi", "Africa/Johannesburg"];
const currencies = ["NGN", "GHS", "KES", "ZAR", "USD"];

const initialState: FormState = {
  name: "",
  slug: "",
  industry: "",
  businessType: "",
  logoUrl: "",
  website: "",
  primaryContactEmail: "",
  primaryContactPhone: "",
  primaryAdminName: "",
  primaryAdminEmail: "",
  primaryAdminPhone: "",
  adminRole: "",
  country: "Nigeria",
  timezone: "Africa/Lagos",
  currency: "NGN",
  status: "trial",
  plan: "starter",
  billingCycle: "per_campaign",
  billingEmail: "",
  faviconIcoUrl: "",
  favicon16Url: "",
  favicon32Url: "",
  appleTouchIconUrl: "",
  android192Url: "",
  android512Url: "",
  manifestUrl: "",
};

export default function NewOrganizationPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => {
    if (typeof window === "undefined") return initialState;
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return initialState;
    try {
      const parsed = JSON.parse(raw) as Partial<FormState>;
      return { ...initialState, ...parsed };
    } catch {
      window.localStorage.removeItem(DRAFT_KEY);
      return initialState;
    }
  });
  const [savingDraft, setSavingDraft] = useState(false);
  const [creating, setCreating] = useState(false);
  const [uploadingAsset, setUploadingAsset] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function getAccessToken() {
    const { data } = await supabaseClient.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) {
      toast.error("Session expired. Please sign in again.");
      router.replace("/login");
      return null;
    }
    return accessToken;
  }

  async function handleSaveDraft() {
    setSavingDraft(true);
    localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
    setSavingDraft(false);
    toast.success("Draft saved locally in this browser.");
  }

  async function handleAssetUpload(file: File | null, assetType: AssetType, targetField: keyof FormState) {
    if (!file) return;
    const accessToken = await getAccessToken();
    if (!accessToken) return;

    setUploadingAsset(true);
    const body = new FormData();
    body.append("file", file);
    body.append("assetType", assetType);
    if (form.slug.trim()) body.append("slug", form.slug.trim());

    const response = await fetch("/api/platform/organizations/logo-upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body,
    });
    const result = (await response.json()) as { success: boolean; message?: string; logoUrl?: string };
    setUploadingAsset(false);
    if (!response.ok || !result.success || !result.logoUrl) {
      toast.error(result.message ?? "Asset upload failed.");
      return;
    }
    update(targetField, result.logoUrl as FormState[typeof targetField]);
    toast.success("Asset uploaded.");
  }

  async function handleBrandPackUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    const byName: Record<string, File> = {};
    for (const file of Array.from(files)) {
      byName[file.name.toLowerCase()] = file;
    }
    const mappings: Array<{ fileName: string; assetType: AssetType; field: keyof FormState }> = [
      { fileName: "favicon.ico", assetType: "favicon_ico", field: "faviconIcoUrl" },
      { fileName: "favicon-16x16.png", assetType: "favicon_16", field: "favicon16Url" },
      { fileName: "favicon-32x32.png", assetType: "favicon_32", field: "favicon32Url" },
      { fileName: "apple-touch-icon.png", assetType: "apple_touch", field: "appleTouchIconUrl" },
      { fileName: "android-chrome-192x192.png", assetType: "android_192", field: "android192Url" },
      { fileName: "android-chrome-512x512.png", assetType: "android_512", field: "android512Url" },
      { fileName: "site.webmanifest", assetType: "manifest", field: "manifestUrl" },
      { fileName: "iminnd-logo.png", assetType: "logo", field: "logoUrl" },
      { fileName: "logo.png", assetType: "logo", field: "logoUrl" },
      { fileName: "logo.jpg", assetType: "logo", field: "logoUrl" },
      { fileName: "logo.jpeg", assetType: "logo", field: "logoUrl" },
      { fileName: "logo.svg", assetType: "logo", field: "logoUrl" },
    ];
    for (const mapping of mappings) {
      const file = byName[mapping.fileName];
      if (file) {
        // Sequential upload to avoid race conditions with shared loader state.
        await handleAssetUpload(file, mapping.assetType, mapping.field);
      }
    }
    toast.success("Brand pack processed.");
  }

  async function handleCreateOrganization() {
    if (!form.name.trim() || !form.slug.trim() || !form.primaryAdminName.trim() || !form.primaryAdminEmail.trim()) {
      toast.error("Organization name, slug, primary admin name and email are required.");
      return;
    }
    const accessToken = await getAccessToken();
    if (!accessToken) return;

    setCreating(true);
    const response = await fetch("/api/platform/organizations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        name: form.name,
        slug: form.slug,
        industry: form.industry || undefined,
        businessType: form.businessType || undefined,
        logoUrl: form.logoUrl || undefined,
        website: form.website || undefined,
        primaryContactEmail: form.primaryContactEmail || undefined,
        primaryContactPhone: form.primaryContactPhone || undefined,
        primaryAdminName: form.primaryAdminName,
        primaryAdminEmail: form.primaryAdminEmail,
        primaryAdminPhone: form.primaryAdminPhone || undefined,
        country: form.country,
        timezone: form.timezone,
        currency: form.currency,
        status: form.status,
        plan: form.plan,
        billingEmail: form.billingEmail || undefined,
        faviconIcoUrl: form.faviconIcoUrl || undefined,
        favicon16Url: form.favicon16Url || undefined,
        favicon32Url: form.favicon32Url || undefined,
        appleTouchIconUrl: form.appleTouchIconUrl || undefined,
        android192Url: form.android192Url || undefined,
        android512Url: form.android512Url || undefined,
        manifestUrl: form.manifestUrl || undefined,
      }),
    });

    const result = (await response.json()) as { success: boolean; message?: string; organization?: { id: string } };
    setCreating(false);

    if (!response.ok || !result.success) {
      toast.error(result.message ?? "Failed to create organization.");
      return;
    }

    localStorage.removeItem(DRAFT_KEY);
    toast.success("Organization created and admin invite initiated.");
    router.push(`/super-admin/organizations/${result.organization?.id ?? ""}`);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Create Organization</h1>
          <p className="mt-1 text-sm text-muted-foreground">Create tenant identity, primary admin, and platform defaults.</p>
        </div>
        <Button variant="outline" className="rounded-full" asChild>
          <Link href="/super-admin/organizations">Cancel</Link>
        </Button>
      </div>

      <section className="rounded-4xl bg-card p-6 shadow-sm ring-1 ring-border/60">
        <SectionTitle title="Organization Details" description="Basic company identity and public-facing details." />
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <Field label="Organization name"><Input value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="e.g. Prime Activations Ltd" /></Field>
          <Field label="Organization code / slug"><Input value={form.slug} onChange={(e) => update("slug", e.target.value.toLowerCase().replace(/\s+/g, "-"))} placeholder="prime-activations" /></Field>
          <Field label="Industry">
            <Select value={form.industry} onValueChange={(value) => update("industry", value)}>
              <SelectTrigger><SelectValue placeholder="Select industry" /></SelectTrigger>
              <SelectContent>{industries.map((industry) => <SelectItem key={industry} value={industry}>{industry}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Business type">
            <Select value={form.businessType} onValueChange={(value) => update("businessType", value)}>
              <SelectTrigger><SelectValue placeholder="Select business type" /></SelectTrigger>
              <SelectContent>{businessTypes.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Website optional"><Input value={form.website} onChange={(e) => update("website", e.target.value)} placeholder="https://company.com" /></Field>
          <Field label="Primary contact email"><Input value={form.primaryContactEmail} onChange={(e) => update("primaryContactEmail", e.target.value)} type="email" placeholder="contact@company.com" /></Field>
          <Field label="Primary contact phone"><Input value={form.primaryContactPhone} onChange={(e) => update("primaryContactPhone", e.target.value)} inputMode="tel" placeholder="0800 000 0000" /></Field>
        </div>
      </section>

      <section className="rounded-4xl bg-card p-6 shadow-sm ring-1 ring-border/60">
        <SectionTitle title="Brand Assets" description="Upload a logo or a full brand pack folder. Advanced fields are optional." />
        <div className="mt-4 rounded-2xl border border-dashed border-border/70 bg-muted/20 p-3">
          <p className="mb-2 text-sm font-medium">Upload Brand Pack Folder</p>
          <input
            type="file"
            multiple
            disabled={uploadingAsset}
            {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
            onChange={(event) => handleBrandPackUpload(event.target.files)}
          />
          <p className="mt-1 text-xs text-muted-foreground">Choose a folder containing favicon files + manifest to auto-map in one action.</p>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <AssetField label="Logo" value={form.logoUrl} onValueChange={(value) => update("logoUrl", value)} accept="image/*" uploading={uploadingAsset} onUpload={(file) => handleAssetUpload(file, "logo", "logoUrl")} />
        </div>
        <details className="mt-4 rounded-2xl border border-border/70 p-3">
          <summary className="cursor-pointer text-sm font-medium">Advanced icon and manifest fields</summary>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
          <AssetField label="favicon.ico" value={form.faviconIcoUrl} onValueChange={(value) => update("faviconIcoUrl", value)} accept=".ico,image/x-icon" uploading={uploadingAsset} onUpload={(file) => handleAssetUpload(file, "favicon_ico", "faviconIcoUrl")} />
          <AssetField label="favicon-16x16.png" value={form.favicon16Url} onValueChange={(value) => update("favicon16Url", value)} accept="image/png" uploading={uploadingAsset} onUpload={(file) => handleAssetUpload(file, "favicon_16", "favicon16Url")} />
          <AssetField label="favicon-32x32.png" value={form.favicon32Url} onValueChange={(value) => update("favicon32Url", value)} accept="image/png" uploading={uploadingAsset} onUpload={(file) => handleAssetUpload(file, "favicon_32", "favicon32Url")} />
          <AssetField label="apple-touch-icon.png" value={form.appleTouchIconUrl} onValueChange={(value) => update("appleTouchIconUrl", value)} accept="image/png" uploading={uploadingAsset} onUpload={(file) => handleAssetUpload(file, "apple_touch", "appleTouchIconUrl")} />
          <AssetField label="android-chrome-192x192.png" value={form.android192Url} onValueChange={(value) => update("android192Url", value)} accept="image/png" uploading={uploadingAsset} onUpload={(file) => handleAssetUpload(file, "android_192", "android192Url")} />
          <AssetField label="android-chrome-512x512.png" value={form.android512Url} onValueChange={(value) => update("android512Url", value)} accept="image/png" uploading={uploadingAsset} onUpload={(file) => handleAssetUpload(file, "android_512", "android512Url")} />
          <AssetField label="site.webmanifest" value={form.manifestUrl} onValueChange={(value) => update("manifestUrl", value)} accept=".webmanifest,application/manifest+json,application/json" uploading={uploadingAsset} onUpload={(file) => handleAssetUpload(file, "manifest", "manifestUrl")} />
          </div>
        </details>
        <p className="mt-3 text-xs text-muted-foreground">{uploadingAsset ? "Uploading brand asset..." : "Either upload files directly or paste hosted URLs."}</p>
      </section>

      <section className="rounded-4xl bg-card p-6 shadow-sm ring-1 ring-border/60">
        <SectionTitle title="Primary Admin" description="This user will receive the first organization invite." />
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <Field label="Full name"><Input value={form.primaryAdminName} onChange={(e) => update("primaryAdminName", e.target.value)} placeholder="e.g. Tolu Balogun" /></Field>
          <Field label="Email address"><Input value={form.primaryAdminEmail} onChange={(e) => update("primaryAdminEmail", e.target.value)} type="email" placeholder="admin@company.com" /></Field>
          <Field label="Phone number"><Input value={form.primaryAdminPhone} onChange={(e) => update("primaryAdminPhone", e.target.value)} inputMode="tel" placeholder="0800 000 0000" /></Field>
          <Field label="Role / title">
            <Select value={form.adminRole} onValueChange={(value) => update("adminRole", value)}>
              <SelectTrigger><SelectValue placeholder="Select role/title" /></SelectTrigger>
              <SelectContent>{adminRoles.map((role) => <SelectItem key={role} value={role}>{role}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>
      </section>

      <section className="rounded-4xl bg-card p-6 shadow-sm ring-1 ring-border/60">
        <SectionTitle title="Platform Settings" description="Default tenant configuration for billing, access, and localization." />
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <Field label="Country"><Select value={form.country} onValueChange={(value) => update("country", value)}><SelectTrigger><SelectValue placeholder="Select country" /></SelectTrigger><SelectContent>{countries.map((country) => <SelectItem key={country} value={country}>{country}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Timezone"><Select value={form.timezone} onValueChange={(value) => update("timezone", value)}><SelectTrigger><SelectValue placeholder="Select timezone" /></SelectTrigger><SelectContent>{timezones.map((timezone) => <SelectItem key={timezone} value={timezone}>{timezone}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Currency"><Select value={form.currency} onValueChange={(value) => update("currency", value)}><SelectTrigger><SelectValue placeholder="Select currency" /></SelectTrigger><SelectContent>{currencies.map((currency) => <SelectItem key={currency} value={currency}>{currency}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Organization status"><Select value={form.status} onValueChange={(value: FormState["status"]) => update("status", value)}><SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger><SelectContent><SelectItem value="trial">Trial</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="suspended">Suspended</SelectItem><SelectItem value="archived">Archived</SelectItem></SelectContent></Select></Field>
          <Field label="Subscription plan"><Select value={form.plan} onValueChange={(value: FormState["plan"]) => update("plan", value)}><SelectTrigger><SelectValue placeholder="Select plan" /></SelectTrigger><SelectContent><SelectItem value="starter">Starter</SelectItem><SelectItem value="growth">Growth</SelectItem><SelectItem value="enterprise">Enterprise</SelectItem></SelectContent></Select></Field>
          <Field label="Billing cycle"><Select value={form.billingCycle} onValueChange={(value) => update("billingCycle", value)}><SelectTrigger><SelectValue placeholder="Select billing cycle" /></SelectTrigger><SelectContent><SelectItem value="per_campaign">Per Campaign</SelectItem><SelectItem value="monthly">Monthly</SelectItem><SelectItem value="quarterly">Quarterly</SelectItem><SelectItem value="annual">Annual</SelectItem></SelectContent></Select></Field>
          <Field label="Billing email optional"><Input value={form.billingEmail} onChange={(e) => update("billingEmail", e.target.value)} type="email" placeholder="billing@company.com" /></Field>
        </div>
      </section>

      <div className="flex justify-end gap-2">
        <Button variant="outline" className="rounded-full" disabled={savingDraft || creating} onClick={handleSaveDraft}>{savingDraft ? "Saving Draft..." : "Save as Draft"}</Button>
        <Button className="rounded-full px-6" disabled={creating || savingDraft || uploadingAsset} onClick={handleCreateOrganization}>{creating ? "Creating Organization..." : "Create Organization & Send Invite"}</Button>
      </div>
    </div>
  );
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="font-medium">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

function AssetField({
  label,
  value,
  onValueChange,
  accept,
  uploading,
  onUpload,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  accept: string;
  uploading: boolean;
  onUpload: (file: File | null) => void;
}) {
  return (
    <div className="space-y-2 rounded-2xl border border-border/70 bg-muted/20 p-3">
      <span className="text-sm font-medium">{label}</span>
      <Input value={value} onChange={(event) => onValueChange(event.target.value)} placeholder="https://..." />
      <Input type="file" accept={accept} disabled={uploading} onChange={(event) => onUpload(event.target.files?.[0] ?? null)} />
    </div>
  );
}
