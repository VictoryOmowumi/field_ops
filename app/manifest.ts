import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ActivationIQ",
    short_name: "ActIQ",
    description: "Field sales activation and sync platform",
    start_url: "/login",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0f141a",
    theme_color: "#0f141a",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/apple-touch-icon.png",
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
