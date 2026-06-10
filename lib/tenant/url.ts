export const APP_DOMAIN = "activationiq.org";

/**
 * Builds a base URL scoped to an organization's subdomain (e.g. https://brandx.activationiq.org).
 * Falls back to `fallbackBaseUrl` when no subdomain is set, preserving localhost/dev hosts.
 */
export function buildTenantBaseUrl(subdomain: string | null | undefined, fallbackBaseUrl: string) {
  const normalized = subdomain?.trim().toLowerCase();
  if (!normalized) return fallbackBaseUrl;

  try {
    const url = new URL(fallbackBaseUrl);
    if (url.hostname === "localhost" || url.hostname.endsWith(".localhost")) {
      return `${url.protocol}//${normalized}.${url.hostname}${url.port ? `:${url.port}` : ""}`;
    }
    return `${url.protocol}//${normalized}.${APP_DOMAIN}`;
  } catch {
    return fallbackBaseUrl;
  }
}
