import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";

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
  return (
    <main className="min-h-screen bg-[#f6f2ee] p-4 dark:bg-background md:p-8">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-8xl gap-4 rounded-4xl bg-card p-3 shadow-sm ring-1 ring-black/5 dark:ring-white/10 md:grid-cols-2 md:gap-6 md:p-5">
        <aside className="relative hidden overflow-hidden rounded-[1.6rem] bg-linear-to-br from-[#f8ece4] via-[#f7c9a9] to-[#ee9e70] p-8 dark:from-[#2a241f] dark:via-[#3a2a20] dark:to-[#4a2f22] md:flex md:flex-col md:justify-between">
          <div className="relative z-10">
            <Link href="/login" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Image src="/orange-black.png" alt="ActivationIQ logo" width={80} height={80} className="w-full h-auto" />
            </Link>
          </div>
          <div className="relative z-10 max-w-md">
            <p className="text-sm text-black/65 dark:text-white/70">Multi-tenant field activation platform</p>
            <h2 className="mt-3 text-4xl font-semibold leading-tight text-black/90 dark:text-white/90">
              Get access to your activation command center.
            </h2>
          </div>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_70%,rgba(255,122,63,0.45),transparent_45%)] dark:bg-[radial-gradient(circle_at_70%_70%,rgba(255,122,63,0.22),transparent_52%)]" />
        </aside>

        <section className="flex items-center justify-center rounded-[1.6rem] bg-card/40 p-4 dark:bg-card/30 md:p-8">
          <div className="w-full max-w-md">
                         <Image src="/orange-black.png" alt="ActivationIQ logo" width={40} height={40} className="w-24 flex md:hidden h-auto object-contain" />
            <h1 className="mt-1 text-4xl font-semibold tracking-tight text-foreground">{title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{description}</p>

            <div className="mt-8 space-y-4">{children}</div>
            {footer ? <div className="mt-6 text-sm text-muted-foreground">{footer}</div> : null}
          </div>
        </section>
      </div>
    </main>
  );
}
