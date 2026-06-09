import type { ModuleKey, TerminologyKey } from "@/lib/tenant-experience/types";

export type BackofficeRole = "admin" | "super_admin";

export type NavAction = {
  label: string;
  href: string;
  icon: unknown;
  terminologyKey?: TerminologyKey;
  moduleKey?: ModuleKey;
};

export type UtilityAction = {
  label: string;
  icon: unknown;
  href?: string;
};
