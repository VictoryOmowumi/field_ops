export type BackofficeRole = "admin" | "super_admin";

export type NavAction = {
  label: string;
  href: string;
  icon: unknown;
};

export type UtilityAction = {
  label: string;
  icon: unknown;
  href?: string;
};
