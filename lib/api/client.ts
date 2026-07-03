"use client";

import { supabaseClient } from "@/lib/supabase/client";

const REQUEST_TIMEOUT_MS = 9000;

let redirectingToLogin = false;

/**
 * fetch() wrapper that aborts after REQUEST_TIMEOUT_MS. On a poor/unstable
 * connection the browser can report navigator.onLine === true while a request
 * hangs indefinitely (never rejects), so nothing downstream ever falls back
 * to cache. This turns that hang into a rejection that isLikelyOfflineError
 * recognizes, so existing offline fallbacks actually run.
 */
export async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: init?.signal ?? controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Network timeout: request took too long (offline or poor network).");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function forceLoginRedirect() {
  if (redirectingToLogin) return;
  redirectingToLogin = true;
  try {
    await supabaseClient.auth.signOut();
  } catch {
    // no-op
  }
  if (typeof window !== "undefined") {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.replace(`/login?next=${next}`);
  }
}

export async function authorizedFetch<T>(input: string, init?: RequestInit): Promise<T> {
  // Fast path: skip getSession() when offline to avoid the Supabase SDK's
  // token-refresh network timeout (up to 20-30 seconds before it gives up).
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("Network offline: session unavailable");
  }

  const { data, error: sessionError } = await supabaseClient.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    const isNetworkIssue =
      sessionError != null &&
      /failed to fetch|network|load failed/i.test((sessionError as Error).message ?? "");
    if (isNetworkIssue) {
      throw new Error("Network offline: session unavailable");
    }
    await forceLoginRedirect();
    throw new Error("Session expired. Redirecting to login.");
  }

  const response = await fetchWithTimeout(input, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 401 || response.status === 403) {
    await forceLoginRedirect();
    throw new Error("Session expired. Redirecting to login.");
  }

  let result: (T & { success?: boolean; message?: string }) | null = null;
  try {
    result = await response.json();
  } catch {
    throw new Error(`Request failed (${response.status} ${response.statusText || "error"}).`);
  }

  if (!response.ok || (result && "success" in result && result.success === false)) {
    throw new Error(result?.message ?? `Request failed (${response.status}).`);
  }

  return result as T & { success?: boolean; message?: string };
}
