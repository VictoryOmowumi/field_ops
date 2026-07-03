import { NextRequest } from "next/server";

import { extractAppRole, type AppRole } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type AuthenticatedRequestUser = {
  id: string;
  email: string | null;
  role: AppRole | null;
};

export class AuthProviderUnavailableError extends Error {
  constructor(message = "Authentication provider is temporarily unavailable.") {
    super(message);
    this.name = "AuthProviderUnavailableError";
  }
}

export function isAuthProviderUnavailableError(error: unknown) {
  return error instanceof AuthProviderUnavailableError;
}

function isLikelyAuthNetworkError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  const cause = "cause" in error ? error.cause : null;
  const causeMessage = cause && typeof cause === "object" && "message" in cause && typeof cause.message === "string"
    ? cause.message
    : "";
  const causeCode = cause && typeof cause === "object" && "code" in cause && typeof cause.code === "string"
    ? cause.code
    : "";

  return /failed to fetch|fetch failed|network|enotfound|econnrefused|etimedout/i.test(`${message} ${causeMessage} ${causeCode}`);
}

function readBearerToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

export async function getAuthenticatedUserFromRequest(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const token = readBearerToken(request);

  if (token) {
    const { data, error } = await supabase.auth.getUser(token);
    if (error) {
      if (isLikelyAuthNetworkError(error)) throw new AuthProviderUnavailableError(error.message);
      return null;
    }
    if (!data.user) return null;
    return {
      id: data.user.id,
      email: data.user.email ?? null,
      role: extractAppRole(data.user),
    } satisfies AuthenticatedRequestUser;
  }

  return null;
}

export function hasRequiredRole(
  user: AuthenticatedRequestUser | null,
  allowedRoles: AppRole[]
) {
  if (!user?.role) return false;
  return allowedRoles.includes(user.role);
}
