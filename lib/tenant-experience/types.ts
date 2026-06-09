// Tenant Experience Engine — config contract.
//
// One JSON document per organization (organizations.experience_config), deep-merged
// over DEFAULT_TENANT_EXPERIENCE_CONFIG at read time. Tenants only specify what they
// override — everything else falls back to the platform default, which is defined to
// match IMINNDX's current, shipped behavior exactly. This is what makes the engine
// additive: an organization with `experience_config = {}` renders identically to today.
//
// Rule for every axis below: a tenant SELECTS a registered variant by name (or a
// dictionary value). Nothing here is, or should ever become, a place to branch on
// `organization.slug` — new experiences are new registry entries + new config rows,
// never new conditionals in shared components.

export type TerminologyKey =
  | "outlet"
  | "outlets"
  | "agent"
  | "agents"
  | "campaign"
  | "campaigns"
  | "conversion"
  | "conversions"
  | "visit"
  | "visits"
  | "supervisor"
  | "supervisors"
  | "outletType"
  | "posm"
  | "freeSample"
  | "evidence";

export type TerminologyDictionary = Partial<Record<TerminologyKey, string>>;

export type ModuleKey =
  | "outlets"
  | "posm"
  | "salesTracking"
  | "freeSampling"
  | "evidenceGallery"
  | "reports"
  | "maps"
  | "agentPerformance"
  | "supervisorReview";

export type ModuleToggles = Partial<Record<ModuleKey, boolean>>;

export type ShellVariant = "backoffice-default" | "command-rail" | "sidebar";

// Controls which UI variant the shared/public-facing pages render.
// "classic" → original neutral layout (default for all existing tenants).
// "enhanced" → branded layout with tenant colors, hero section, and tabbed content.
export type UiVariant = "classic" | "enhanced";

// Named color presets — stored by name, not raw CSS values.
// New presets are registered in lib/tenant-experience/theme-presets.ts.
// "default" means no override (IMINNDX warm-orange theme from globals.css).
export type TenantColorPreset = "default" | "blue" | "slate" | "green" | "purple" | "red" | "teal" | "amber" | "rose" | "navy";

export interface TenantThemeConfig {
  colorPreset: TenantColorPreset;
  // Full Google Fonts CSS2 URL (or any @import-compatible stylesheet URL).
  // Null/absent = platform default font (Outfit). Set by super admins in the
  // experience config UI. The first `family=` param is parsed to get --font-sans.
  // e.g. "https://fonts.googleapis.com/css2?family=Manrope:wght@200..800&display=swap"
  fontUrl: string | null;
}

export type DashboardVariant = "operational" | "command-center";

export type SubmissionUiVariant = "guided-flow" | "stepper" | "single-page" | "task-card" | "checklist";

export type CampaignSetupFlowVariant = "guided" | "streamlined";

export interface TenantLayoutConfig {
  shellVariant: ShellVariant;
  uiVariant: UiVariant;
}

export interface TenantDashboardConfig {
  variant: DashboardVariant;
}

export interface TenantSubmissionConfig {
  variant: SubmissionUiVariant;
}

export interface TenantWorkflowConfig {
  campaignSetupFlow: CampaignSetupFlowVariant;
}

export interface TenantExperienceConfig {
  terminology: TerminologyDictionary;
  modules: ModuleToggles;
  layout: TenantLayoutConfig;
  dashboards: TenantDashboardConfig;
  submissionUi: TenantSubmissionConfig;
  workflow: TenantWorkflowConfig;
  theme: TenantThemeConfig;
}

// Deep-partial mirror of TenantExperienceConfig — this is the shape stored in
// organizations.experience_config. Tenants persist only the keys they override.
export type TenantExperienceConfigOverrides = {
  terminology?: TerminologyDictionary;
  modules?: ModuleToggles;
  layout?: Partial<TenantLayoutConfig>;
  dashboards?: Partial<TenantDashboardConfig>;
  submissionUi?: Partial<TenantSubmissionConfig>;
  workflow?: Partial<TenantWorkflowConfig>;
  theme?: Partial<TenantThemeConfig>;
};

// Platform default = IMINNDX's current, shipped experience, named explicitly.
// Every label here matches the literal strings already rendered in production today
// (see components/backoffice/config.ts, components/agent/workflow/GuidedVisitFlow.tsx).
// Changing these values changes IMINNDX's live product — treat edits here with the
// same care as editing a published form version.
//
// agent/agents: IMINNDX calls field agents "Rep"/"Reps" in nav and table headers,
// not "Agent"/"Agents". The defaults reflect what the UI already shows.
export const DEFAULT_TENANT_EXPERIENCE_CONFIG: TenantExperienceConfig = {
  terminology: {
    outlet: "Outlet",
    outlets: "Outlets",
    agent: "Rep",
    agents: "Reps",
    campaign: "Campaign",
    campaigns: "Campaigns",
    conversion: "Conversion",
    conversions: "Conversions",
    visit: "Visit",
    visits: "Visits",
    supervisor: "Supervisor",
    supervisors: "Supervisors",
    outletType: "Outlet Type",
    posm: "POSM",
    freeSample: "Free Sample",
    evidence: "Evidence",
  },
  modules: {
    outlets: true,
    posm: true,
    salesTracking: true,
    freeSampling: true,
    evidenceGallery: true,
    reports: true,
    maps: true,
    agentPerformance: true,
    supervisorReview: true,
  },
  layout: {
    shellVariant: "backoffice-default",
    uiVariant: "classic",
  },
  dashboards: {
    variant: "operational",
  },
  submissionUi: {
    variant: "guided-flow",
  },
  workflow: {
    campaignSetupFlow: "guided",
  },
  theme: {
    colorPreset: "default",
    fontUrl: null,
  },
};
