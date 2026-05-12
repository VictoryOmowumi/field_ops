import { NextRequest, NextResponse } from "next/server";

import { getBrandBySlug } from "@/lib/branding/server";

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("org")?.trim().toLowerCase();
  if (!slug) {
    return NextResponse.json({ success: false, message: "Organization slug is required." }, { status: 400 });
  }
  const brand = await getBrandBySlug(slug);
  if (!brand) {
    return NextResponse.json({ success: false, message: "Organization not found." }, { status: 404 });
  }
  return NextResponse.json({ success: true, brand });
}
