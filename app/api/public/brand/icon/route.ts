import { NextRequest, NextResponse } from "next/server";
import { access } from "node:fs/promises";
import path from "node:path";

import { getBrandBySlug, getBrandBySubdomain } from "@/lib/branding/server";
import { BRAND_COOKIE_SLUG } from "@/lib/branding/types";

async function hasFile(publicRelativePath: string) {
  try {
    await access(path.join(process.cwd(), "public", publicRelativePath));
    return true;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const slugFromQuery = params.get("org")?.trim().toLowerCase();
  const subdomainFromQuery = params.get("subdomain")?.trim().toLowerCase();
  const slugFromCookie = request.cookies.get(BRAND_COOKIE_SLUG)?.value?.trim().toLowerCase();
  const slug = slugFromQuery || slugFromCookie;
  const size = params.get("size") === "512" ? "512" : "192";
  const variant = params.get("variant")?.trim().toLowerCase();

  // Resolve brand — subdomain param takes priority
  const brand = subdomainFromQuery
    ? await getBrandBySubdomain(subdomainFromQuery)
    : slug
    ? await getBrandBySlug(slug)
    : null;

  const iconKey = subdomainFromQuery ?? slug ?? null;

  if (iconKey) {
    const orgIconPath =
      variant === "ico" ? `${iconKey}/favicon.ico`
      : variant === "16" ? `${iconKey}/favicon-16x16.png`
      : variant === "32" ? `${iconKey}/favicon-32x32.png`
      : variant === "apple" ? `${iconKey}/apple-touch-icon.png`
      : size === "512" ? `${iconKey}/android-chrome-512x512.png`
      : `${iconKey}/android-chrome-192x192.png`;
    if (await hasFile(orgIconPath)) {
      return NextResponse.redirect(new URL(`/${orgIconPath}`, request.url));
    }
  }

  if (brand) {
    const brandedAsset =
      variant === "ico" ? brand.faviconIcoUrl :
      variant === "16" ? brand.favicon16Url :
      variant === "32" ? brand.favicon32Url :
      variant === "apple" ? brand.appleTouchIconUrl :
      size === "512" ? brand.android512Url :
      brand.android192Url;
    if (brandedAsset) return NextResponse.redirect(brandedAsset);
    if (brand.logoUrl) return NextResponse.redirect(brand.logoUrl);
  }

  const fallback =
    variant === "ico" ? "/favicon.ico"
    : variant === "16" ? "/favicon-16x16.png"
    : variant === "32" ? "/favicon-32x32.png"
    : variant === "apple" ? "/apple-touch-icon.png"
    : size === "512" ? "/android-chrome-512x512.png"
    : "/android-chrome-192x192.png";
  return NextResponse.redirect(new URL(fallback, request.url));
}
