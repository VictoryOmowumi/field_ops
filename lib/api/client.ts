"use client";

import { supabaseClient } from "@/lib/supabase/client";

let redirectingToLogin = false;

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
  const { data } = await supabaseClient.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    await forceLoginRedirect();
    throw new Error("Session expired. Redirecting to login.");
  }

  const response = await fetch(input, {
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
