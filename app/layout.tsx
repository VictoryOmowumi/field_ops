import type { Metadata } from "next";
import { Geist, Outfit } from "next/font/google";
import { cookies, headers } from "next/headers";

import { PwaRuntimeProvider } from "@/components/providers/pwa-runtime";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { BrandProvider } from "@/components/providers/brand-provider";
import { TenantExperienceProvider } from "@/components/providers/tenant-experience-provider";
import { Toaster } from "@/components/ui/sonner";
import { APP_NAME } from "@/lib/constants";
import { BRAND_COOKIE_NAME, BRAND_COOKIE_SLUG } from "@/lib/branding/types";

import "./globals.css";
import "leaflet/dist/leaflet.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";

const fontSans = Outfit({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-sans",
});

const fontMono = Geist({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-mono",
});

export async function generateMetadata(): Promise<Metadata> {
  const store = await cookies();
  const headersList = await headers();
  const tenantSubdomain = headersList.get("x-tenant-subdomain");
  const name = store.get(BRAND_COOKIE_NAME)?.value || APP_NAME;
  // Prefer subdomain for icon lookup; fall back to cookie-stored slug
  const cookieSlug = store.get(BRAND_COOKIE_SLUG)?.value ?? "";
  // Build org identifier — prefer subdomain (authoritative on subdomain hosts), fallback to cookie slug
  const orgParam = tenantSubdomain
    ? `subdomain=${encodeURIComponent(tenantSubdomain)}`
    : cookieSlug
    ? `org=${encodeURIComponent(cookieSlug)}`
    : null;
  const iconFromApi = `/api/public/brand/icon?variant=32${orgParam ? `&${orgParam}` : ""}`;
  const icon16FromApi = `/api/public/brand/icon?variant=16${orgParam ? `&${orgParam}` : ""}`;
  const iconIcoFromApi = `/api/public/brand/icon?variant=ico${orgParam ? `&${orgParam}` : ""}`;
  const iconAppleFromApi = `/api/public/brand/icon?variant=apple${orgParam ? `&${orgParam}` : ""}`;

  return {
    title: `${name}`,
    description: `${name} multi-tenant field activation platform`,
    icons: {
      icon: orgParam ? [{ url: iconFromApi }, { url: icon16FromApi }, { url: iconIcoFromApi }] : [{ url: "/favicon.ico" }],
      apple: orgParam ? [{ url: iconAppleFromApi }] : [{ url: "/apple-touch-icon.png" }],
      shortcut: orgParam ? [iconIcoFromApi] : ["/favicon.ico"],
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headersList = await headers();
  const tenantSubdomain = headersList.get("x-tenant-subdomain") ?? null;

  return (
    <html lang="en">
      <body className={`${fontSans.variable} ${fontMono.variable} antialiased`} suppressHydrationWarning={true}>
        <ThemeProvider>
          <PwaRuntimeProvider />
          <BrandProvider initialSubdomain={tenantSubdomain}>
            <TenantExperienceProvider>{children}</TenantExperienceProvider>
          </BrandProvider>
          <Toaster position="top-center" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
