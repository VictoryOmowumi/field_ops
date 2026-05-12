import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
}

function badRequest(message: string) {
  return NextResponse.json({ success: false, message }, { status: 400 });
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["super_admin"])) return forbidden();

  const form = await request.formData();
  const file = form.get("file");
  const slugRaw = String(form.get("slug") ?? "").trim().toLowerCase();
  const assetTypeRaw = String(form.get("assetType") ?? "logo").trim().toLowerCase();
  const bucket = process.env.SUPABASE_ORG_ASSETS_BUCKET || "organization-assets";

  if (!(file instanceof File)) {
    return badRequest("Logo file is required.");
  }
  const allowedAssetTypes = new Set(["logo", "favicon_ico", "favicon_16", "favicon_32", "apple_touch", "android_192", "android_512", "manifest"]);
  const assetType = allowedAssetTypes.has(assetTypeRaw) ? assetTypeRaw : "logo";

  if (assetType !== "manifest" && !file.type.startsWith("image/")) {
    return badRequest("Only image uploads are allowed for this asset type.");
  }
  if (file.size > 5 * 1024 * 1024) {
    return badRequest("Asset size must be 5MB or less.");
  }

  const ext = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() : "png";
  const safeExt = ext && ext.length <= 12 ? ext : "png";
  if (assetType === "manifest") {
    const lowerName = file.name.toLowerCase();
    const isManifestByName = lowerName.endsWith(".webmanifest") || lowerName.endsWith(".json");
    const allowedMime = new Set([
      "application/manifest+json",
      "application/json",
      "text/plain",
      "application/octet-stream",
      "",
    ]);
    if (!isManifestByName && !allowedMime.has(file.type)) {
      return badRequest("Manifest upload must be a webmanifest/json file.");
    }
  }
  if (assetType === "favicon_ico" && safeExt !== "ico") {
    return badRequest("favicon.ico upload must use .ico format.");
  }

  const scope = slugRaw || "org";
  const preferredNameByType: Record<string, string> = {
    logo: `logo-${Date.now()}-${crypto.randomUUID()}.${safeExt}`,
    favicon_ico: "favicon.ico",
    favicon_16: "favicon-16x16.png",
    favicon_32: "favicon-32x32.png",
    apple_touch: "apple-touch-icon.png",
    android_192: "android-chrome-192x192.png",
    android_512: "android-chrome-512x512.png",
    manifest: "site.webmanifest",
  };
  const path = `${scope}/branding/${preferredNameByType[assetType]}`;
  const bytes = await file.arrayBuffer();

  const supabase = createServerSupabaseClient();
  const { data: buckets, error: bucketListError } = await supabase.storage.listBuckets();
  if (bucketListError) {
    return NextResponse.json({ success: false, message: bucketListError.message }, { status: 500 });
  }
  const exists = (buckets ?? []).some((item) => item.name === bucket);
  if (!exists) {
    const { error: createBucketError } = await supabase.storage.createBucket(bucket, {
      public: true,
      fileSizeLimit: 5 * 1024 * 1024,
    });
    if (createBucketError) {
      return NextResponse.json({ success: false, message: `Bucket '${bucket}' not found and could not be created: ${createBucketError.message}` }, { status: 500 });
    }
  }

  const { error: uploadError } = await supabase.storage.from(bucket).upload(path, bytes, {
    contentType: file.type,
    upsert: true,
    cacheControl: "3600",
  });

  if (uploadError) {
    return NextResponse.json({ success: false, message: uploadError.message }, { status: 500 });
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return NextResponse.json({ success: true, logoUrl: data.publicUrl, assetType });
}
