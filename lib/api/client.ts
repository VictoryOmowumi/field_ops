"use client";

import { supabaseClient } from "@/lib/supabase/client";

export async function authorizedFetch<T>(input: string, init?: RequestInit): Promise<T> {
  const { data } = await supabaseClient.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Session expired. Please sign in again.");

  const response = await fetch(input, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });

  const result = (await response.json()) as T & { success?: boolean; message?: string };
  if (!response.ok || ("success" in result && result.success === false)) {
    throw new Error(result.message ?? "Request failed.");
  }

  return result;
}

