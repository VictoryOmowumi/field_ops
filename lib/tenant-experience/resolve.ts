import {
  DEFAULT_TENANT_EXPERIENCE_CONFIG,
  type TenantExperienceConfig,
  type TenantExperienceConfigOverrides,
} from "@/lib/tenant-experience/types";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Deep-merges tenant overrides over the platform default, one level of nesting deep
 * (matches the shape of TenantExperienceConfig — each top-level key is itself a flat
 * dictionary). A tenant that overrides `terminology.outlet` keeps every other
 * terminology key, module toggle, layout choice, etc. at its default value.
 */
export function resolveTenantExperienceConfig(
  overrides: unknown
): TenantExperienceConfig {
  const safeOverrides: TenantExperienceConfigOverrides = isPlainObject(overrides)
    ? (overrides as TenantExperienceConfigOverrides)
    : {};

  const base = DEFAULT_TENANT_EXPERIENCE_CONFIG;

  return {
    terminology: { ...base.terminology, ...safeOverrides.terminology },
    modules: { ...base.modules, ...safeOverrides.modules },
    layout: { ...base.layout, ...safeOverrides.layout },
    dashboards: { ...base.dashboards, ...safeOverrides.dashboards },
    submissionUi: { ...base.submissionUi, ...safeOverrides.submissionUi },
    workflow: { ...base.workflow, ...safeOverrides.workflow },
    theme: { ...base.theme, ...safeOverrides.theme },
  };
}
