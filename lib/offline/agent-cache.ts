import type { AppRole } from "@/lib/auth/roles";
import type { OrgRole } from "@/lib/auth/org-access";
import { db, withDbRetry } from "@/lib/offline/db";
import type { AgentBootstrap } from "@/hooks/useAgentBootstrap";

const AUTH_CONTEXT_KEY = "agent-auth-context-current";
const BOOTSTRAP_KEY = "agent-bootstrap-current";
const CAMPAIGNS_KEY = "agent-campaigns-current";
const SUBMISSIONS_KEY = "agent-submissions-current";
const campaignDetailKey = (campaignId: string) => `agent-campaign-detail-${campaignId}`;
const campaignSubmissionsKey = (campaignId: string) => `agent-campaign-submissions-${campaignId}`;

export class OfflinePreloadRequiredError extends Error {
  readonly code = "OFFLINE_PRELOAD_REQUIRED";

  constructor(message = "Reconnect once to prepare this device for offline use.") {
    super(message);
    this.name = "OfflinePreloadRequiredError";
  }
}

export function isOfflinePreloadRequiredError(error: unknown) {
  return error instanceof OfflinePreloadRequiredError
    || (typeof error === "object" && error !== null && "code" in error && error.code === "OFFLINE_PRELOAD_REQUIRED");
}

export function isLikelyOfflineError(error: unknown) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (!(error instanceof Error)) return false;
  // Match genuine network-layer failures only. Intentionally excludes "503"
  // because a 503 from an unhealthy DB is a *server* error, not a device offline
  // signal — misclassifying it causes "Needs online preload" when the server is
  // simply overloaded, masking the real cause from the agent.
  return /failed to fetch|network|load failed|offline|timeout/i.test(error.message);
}

export type CachedAuthContext = {
  userId: string;
  appRole: AppRole;
  organizationId?: string;
  orgRole?: OrgRole;
  membershipStatus?: string;
  organizationStatus?: string;
  validatedAt: string;
};

export type OfflineAware<T> = T & {
  offlineStatus?: "fresh" | "cached";
};

async function putCache<T>(id: string, payload: T) {
  try {
    await withDbRetry(() => db.agentCache.put({ id, payload, updatedAt: new Date().toISOString() }));
  } catch {
    // Cache writes are best-effort. A failure (first-open migration, private
    // browsing restriction, quota exceeded) must never block the auth flow.
  }
}

async function getCache<T>(id: string): Promise<T | undefined> {
  try {
    // Race the DB read against a 2-second timeout. In development, HMR can
    // leave a stale Dexie connection that blocks the schema upgrade, causing
    // db.agentCache.get() to hang indefinitely. The timeout turns a hang into
    // a cache miss so the caller can fall through to its error/offline state.
    const timeout = new Promise<undefined>((resolve) => setTimeout(resolve, 2000));
    const read = withDbRetry(() => db.agentCache.get(id)).then((row) => row?.payload as T | undefined);
    return await Promise.race([read, timeout]);
  } catch {
    return undefined;
  }
}

export async function cacheAgentAuthContext(context: CachedAuthContext) {
  await putCache(AUTH_CONTEXT_KEY, context);
}

export async function getCachedAgentAuthContext(userId?: string) {
  const context = await getCache<CachedAuthContext>(AUTH_CONTEXT_KEY);
  if (!context) return undefined;
  if (userId && context.userId !== userId) return undefined;
  return context;
}

export async function getAnyCachedAgentAuthContext() {
  return getCache<CachedAuthContext>(AUTH_CONTEXT_KEY);
}

export async function cacheAgentBootstrap(bootstrap: AgentBootstrap) {
  await putCache(BOOTSTRAP_KEY, bootstrap);
}

export async function getCachedAgentBootstrap() {
  return getCache<AgentBootstrap>(BOOTSTRAP_KEY);
}

export async function cacheAgentCampaigns<T>(campaigns: T[]) {
  await putCache(CAMPAIGNS_KEY, campaigns);
}

export async function getCachedAgentCampaigns<T>() {
  return getCache<T[]>(CAMPAIGNS_KEY);
}

export async function cacheAgentCampaignDetail<T extends { id: string }>(campaign: T) {
  await putCache(campaignDetailKey(campaign.id), campaign);
}

export async function getCachedAgentCampaignDetail<T>(campaignId: string) {
  return getCache<T>(campaignDetailKey(campaignId));
}

export async function cacheAgentSubmissions<T>(submissions: T[]) {
  await putCache(SUBMISSIONS_KEY, submissions);
}

export async function getCachedAgentSubmissions<T>() {
  return getCache<T[]>(SUBMISSIONS_KEY);
}

export async function cacheAgentCampaignSubmissions<T>(campaignId: string, submissions: T[]) {
  await putCache(campaignSubmissionsKey(campaignId), submissions);
}

export async function getCachedAgentCampaignSubmissions<T>(campaignId: string) {
  return getCache<T[]>(campaignSubmissionsKey(campaignId));
}
