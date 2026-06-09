import { NextRequest, NextResponse } from "next/server";

import { getBrandBySlug, getBrandBySubdomain } from "@/lib/branding/server";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const slug = params.get("org")?.trim().toLowerCase();
  const subdomain = params.get("subdomain")?.trim().toLowerCase();

  if (!slug && !subdomain) {
    return NextResponse.json({ success: false, message: "Provide 'org' (slug) or 'subdomain'." }, { status: 400 });
  }

  const brand = subdomain
    ? await getBrandBySubdomain(subdomain)
    : await getBrandBySlug(slug!);

  if (!brand) {
    return NextResponse.json({ success: false, message: "Organization not found." }, { status: 404 });
  }
  return NextResponse.json({ success: true, brand });
}
