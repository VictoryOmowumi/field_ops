// Drives how /super-admin/settings renders each row's editor. Every platform_settings row is
// still stored as raw text (unchanged), but a typo-prone free-text field is the wrong editor for
// a boolean flag or a fixed enum — this maps known keys to the right input, and anything not
// listed here falls back to a plain text field exactly as before, so adding a new setting via a
// migration never requires touching this file to keep working.
export type SettingFieldType =
  | { kind: "boolean" }
  | { kind: "select"; options: Array<{ value: string; label: string }> }
  | { kind: "number"; min?: number; step?: number }
  | { kind: "text" };

const BOOLEAN_FIELD: SettingFieldType = { kind: "boolean" };

export const SETTINGS_FIELD_TYPES: Record<string, SettingFieldType> = {
  sync_retry_attempts: { kind: "number", min: 0, step: 1 },
  offline_queue_timeout_minutes: { kind: "number", min: 1, step: 1 },
  photo_upload_max_size_mb: { kind: "number", min: 1, step: 1 },
  default_media_retention_days: { kind: "number", min: 1, step: 1 },
  default_organization_status: {
    kind: "select",
    options: [
      { value: "Active", label: "Active" },
      { value: "Suspended", label: "Suspended" },
      { value: "Trial", label: "Trial" },
      { value: "Archived", label: "Archived" },
    ],
  },
  default_storage_provider: {
    kind: "select",
    options: [
      { value: "supabase", label: "Supabase Storage" },
      { value: "r2", label: "Cloudflare R2" },
    ],
  },
  "commercial.activation.enabled": BOOLEAN_FIELD,
  "commercial.archive.enabled": BOOLEAN_FIELD,
  "commercial.storage.enabled": BOOLEAN_FIELD,
  "commercial.payments.enabled": BOOLEAN_FIELD,
  "commercial.activation.log_only": BOOLEAN_FIELD,
};

export function getSettingFieldType(key: string): SettingFieldType {
  return SETTINGS_FIELD_TYPES[key] ?? { kind: "text" };
}
