import { NextRequest, NextResponse } from "next/server";

const APP_DOMAIN = "activationiq.org";
const APEX_HOSTS = new Set([APP_DOMAIN, `www.${APP_DOMAIN}`]);
const LOCALHOST_RE = /^localhost(:\d+)?$/;

function extractSubdomain(host: string): string | null {
  const hostname = host.split(":")[0];
  if (!hostname || LOCALHOST_RE.test(hostname) || APEX_HOSTS.has(hostname)) return null;
  if (!hostname.endsWith(`.${APP_DOMAIN}`)) return null;
  const sub = hostname.slice(0, hostname.length - APP_DOMAIN.length - 1);
  return sub || null;
}

export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const subdomain = extractSubdomain(host);
  if (!subdomain) return NextResponse.next();

  // Forward subdomain to Server Components and API routes via request header
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-tenant-subdomain", subdomain);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    // Skip Next.js internals and static assets
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|otf)).*)",
  ],
};
