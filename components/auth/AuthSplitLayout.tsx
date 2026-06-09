"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useBrand } from "@/components/providers/brand-provider";

type AuthSplitLayoutProps = {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
};

export default function AuthSplitLayout({
  title,
  description,
  children,
  footer,
}: AuthSplitLayoutProps) {
  const { brandName, logoUrl } = useBrand();

  return (
    <main className="min-h-screen bg-muted/30 p-3 dark:bg-background md:p-5">
      <div className="mx-auto grid min-h-[calc(100vh-1.5rem)] max-w-7xl overflow-hidden rounded-[2rem] shadow-xl ring-1 ring-black/8 dark:ring-white/10 md:grid-cols-[1fr_1.1fr]">

        {/* ── Left: brand panel ── */}
        <aside className="relative hidden flex-col justify-between overflow-hidden bg-primary p-10 md:flex">
          {/* Subtle radial highlight */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_20%,rgba(255,255,255,0.18),transparent_55%)]" />
          {/* Grid dot pattern */}
          <div className="pointer-events-none absolute inset-0 opacity-10"
            style={{
              backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)",
              backgroundSize: "28px 28px",
              color: "white",
            }}
          />

          {/* Logo */}
          <div className="relative z-10">
            <Link href="/login" className="inline-flex items-center gap-3">
              {logoUrl ? (
                <span className="inline-flex items-center justify-center rounded-xl bg-white/15 p-2 ring-1 ring-white/20 backdrop-blur-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element -- dynamic org logo URL */}
                  <img
                    src={logoUrl}
                    alt={brandName}
                    className="h-8 w-auto max-w-36 object-contain"
                  />
                </span>
              ) : (
                <span className="flex size-10 items-center justify-center rounded-xl bg-white/20 text-sm font-bold text-white ring-1 ring-white/20">
                  {brandName.trim().charAt(0).toUpperCase()}
                </span>
              )}
              <span className="text-sm font-semibold text-white/90">{brandName}</span>
            </Link>
          </div>

          {/* Tagline */}
          <div className="relative z-10 max-w-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary-foreground/50">
              Field Activation Platform
            </p>
            <h2 className="mt-3 text-4xl font-semibold leading-[1.15] tracking-tight text-white">
              Your activation command center
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-primary-foreground/70">
              Real-time visibility into campaign progress, outlet coverage, and field team performance.
            </p>
          </div>

          {/* Bottom badge */}
          <div className="relative z-10">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs text-white/70 ring-1 ring-white/15">
              <span className="size-1.5 rounded-full bg-emerald-400" />
              Secure workspace login
            </span>
          </div>
        </aside>

        {/* ── Right: form panel ── */}
        <section className="flex items-center justify-center bg-card p-8 md:p-12">
          <div className="w-full max-w-sm">
            {/* Mobile logo */}
            <div className="mb-8 flex items-center gap-3 md:hidden">
              {logoUrl ? (
                <span className="inline-flex items-center justify-center rounded-xl bg-primary p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- dynamic org logo URL */}
                  <img
                    src={logoUrl}
                    alt={brandName}
                    className="h-7 w-auto max-w-24 object-contain"
                  />
                </span>
              ) : (
                <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
                  {brandName.trim().charAt(0).toUpperCase()}
                </span>
              )}
              <span className="text-sm font-semibold text-foreground">{brandName}</span>
            </div>

            <h1 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{description}</p>

            <div className="mt-8">{children}</div>

            {footer ? (
              <div className="mt-6 text-sm text-muted-foreground">{footer}</div>
            ) : null}
          </div>
        </section>

      </div>
    </main>
  );
}
