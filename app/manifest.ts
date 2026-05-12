import type { MetadataRoute } from "next";
import { cookies } from "next/headers";

import { APP_NAME } from "@/lib/constants";
import { BRAND_COOKIE_SLUG, BRAND_COOKIE_NAME } from "@/lib/branding/types";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const store = await cookies();
  const name = store.get(BRAND_COOKIE_NAME)?.value || APP_NAME;
  const slug = store.get(BRAND_COOKIE_SLUG)?.value || "";
  const iconOrg = slug ? `?org=${encodeURIComponent(slug)}` : "";
  const icon192 = `/api/public/brand/icon?size=192${slug ? `&org=${encodeURIComponent(slug)}` : ""}`;
  const icon512 = `/api/public/brand/icon?size=512${slug ? `&org=${encodeURIComponent(slug)}` : ""}`;
  const manifestStart = slug ? `/login?org=${encodeURIComponent(slug)}` : "/login";

  return {
    name,
    short_name: name,
    description: `${name} field sales activation and sync platform`,
    start_url: manifestStart,
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0f141a",
    theme_color: "#0f141a",
    categories: ["business", "productivity"],
    icons: [
      {
        src: icon192,
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: icon512,
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: `/api/public/brand/icon${iconOrg}`,
        sizes: "180x180",
        type: "image/png",
      },
    ],
    shortcuts: [
      {
        name: "Campaigns",
        short_name: "Campaigns",
        url: "/agent/campaigns",
      },
      {
        name: "Sync Queue",
        short_name: "Sync",
        url: "/agent/sync",
      },
    ],
  };
}
