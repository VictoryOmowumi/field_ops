import type { Metadata } from "next";
import { Geist, Outfit } from "next/font/google";

import { PwaRuntimeProvider } from "@/components/providers/pwa-runtime";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { Toaster } from "@/components/ui/sonner";

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

export const metadata: Metadata = {
  title: "ActivationIQ",
  description: "ActivationIQ multi-tenant field activation platform",
};

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
          {children}
          <Toaster position="top-center" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
