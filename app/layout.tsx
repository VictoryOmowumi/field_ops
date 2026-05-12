import type { Metadata } from "next";
import { Geist, Outfit } from "next/font/google";
import { cookies } from "next/headers";

import { PwaRuntimeProvider } from "@/components/providers/pwa-runtime";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { BrandProvider } from "@/components/providers/brand-provider";
import { Toaster } from "@/components/ui/sonner";
import { APP_NAME } from "@/lib/constants";
import { BRAND_COOKIE_NAME, BRAND_COOKIE_SLUG } from "@/lib/branding/types";

import "./globals.css";
import "leaflet/dist/leaflet.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";

const fontSans = Outfit({
  weight: ["400", "700"],
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
  const name = store.get(BRAND_COOKIE_NAME)?.value || APP_NAME;
  const slug = store.get(BRAND_COOKIE_SLUG)?.value || "";
  const iconFromApi = `/api/public/brand/icon?variant=32${slug ? `&org=${encodeURIComponent(slug)}` : ""}`;
  const icon16FromApi = `/api/public/brand/icon?variant=16${slug ? `&org=${encodeURIComponent(slug)}` : ""}`;
  const iconIcoFromApi = `/api/public/brand/icon?variant=ico${slug ? `&org=${encodeURIComponent(slug)}` : ""}`;
  const iconAppleFromApi = `/api/public/brand/icon?variant=apple${slug ? `&org=${encodeURIComponent(slug)}` : ""}`;

  return {
    title: `${name}`,
    description: `${name} multi-tenant field activation platform`,
    icons: {
      icon: slug ? [{ url: iconFromApi }, { url: icon16FromApi }, { url: iconIcoFromApi }] : [{ url: "/favicon.ico" }],
      apple: slug ? [{ url: iconAppleFromApi }] : [{ url: "/apple-touch-icon.png" }],
      shortcut: slug ? [iconIcoFromApi] : ["/favicon.ico"],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${fontSans.variable} ${fontMono.variable} antialiased`} suppressHydrationWarning={true}>
        <ThemeProvider>
          <PwaRuntimeProvider />
          <BrandProvider>{children}</BrandProvider>
          <Toaster position="top-center" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
