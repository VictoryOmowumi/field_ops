import { NextRequest } from "next/server";

import { extractAppRole, type AppRole } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type AuthenticatedRequestUser = {
  id: string;
  email: string | null;
  role: AppRole | null;
};

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
    if (error || !data.user) return null;
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
