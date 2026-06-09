"use client";

import { useEffect } from "react";
import { COLOR_PRESET_REGISTRY } from "@/lib/tenant-experience/theme-presets";
import { useTenantExperience } from "./tenant-experience-provider";

const STYLE_ID = "actiq-tenant-theme";
const FONT_LINK_ID = "actiq-tenant-font";

// Parses the first font-family name from a Google Fonts CSS2 URL.
// "https://fonts.googleapis.com/css2?family=Manrope:wght@200..800&family=Teko..."
// → "Manrope"
function parseFontFamily(url: string): string | null {
  try {
    const params = new URL(url).searchParams.getAll("family");
    if (params.length === 0) return null;
    return params[0].split(":")[0].trim() || null;
  } catch {
    return null;
  }
}

// Injects (or removes) the tenant font <link> tag.
function applyFontUrl(url: string | null) {
  const existing = document.getElementById(FONT_LINK_ID);
  if (!url) {
    existing?.remove();
    return null;
  }
  if (existing instanceof HTMLLinkElement && existing.href === url) {
    return parseFontFamily(url); // already loaded
  }
  existing?.remove();
  const link = document.createElement("link");
  link.id = FONT_LINK_ID;
  link.rel = "stylesheet";
  link.href = url;
  document.head.appendChild(link);
  return parseFontFamily(url);
}

// Injects (or removes) the tenant CSS variable overrides.
// Handles two axes:
//   1. Color preset — overrides --primary, --ring, chart colors
//   2. Font URL — overrides --font-sans to swap the body typeface
export function TenantThemeApplier() {
  const { config } = useTenantExperience();
  const colorPreset = config.theme.colorPreset;
  const fontUrl = config.theme.fontUrl ?? null;

  useEffect(() => {
    const colorEntry = COLOR_PRESET_REGISTRY[colorPreset] ?? null;
    const fontFamily = applyFontUrl(fontUrl);

    const existing = document.getElementById(STYLE_ID);

    if (!colorEntry && !fontFamily) {
      existing?.remove();
      return;
    }

    const el = existing ?? (() => {
      const tag = document.createElement("style");
      tag.id = STYLE_ID;
      document.head.appendChild(tag);
      return tag;
    })();

    const fontLine = fontFamily ? `  --font-sans: '${fontFamily}', sans-serif;` : "";

    const lightVars = [
      fontLine,
      ...(colorEntry ? Object.entries(colorEntry.light).map(([k, v]) => `  ${k}: ${v};`) : []),
    ].filter(Boolean).join("\n");

    const darkVars = colorEntry
      ? Object.entries(colorEntry.dark).map(([k, v]) => `  ${k}: ${v};`).join("\n")
      : "";

    el.textContent = `:root {\n${lightVars}\n}${darkVars ? `\n.dark {\n${darkVars}\n}` : ""}`;
  }, [colorPreset, fontUrl]);

  return null;
}
