"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { pwaFlags } from "@/lib/pwa/flags";

type DeferredBeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DISMISS_KEY = "actiQ_install_prompt_dismissed_at";

function isStandaloneMode() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isiOS() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export default function InstallPromptCard() {
  const [deferredPrompt, setDeferredPrompt] = useState<DeferredBeforeInstallPromptEvent | null>(() => {
    if (typeof window === "undefined") return null;
    return (
      (window as Window & { __actiQDeferredInstallPrompt?: DeferredBeforeInstallPromptEvent })
        .__actiQDeferredInstallPrompt ?? null
    );
  });
  const [showIosHint] = useState(() => isiOS());
  const [installPromptEligible, setInstallPromptEligible] = useState(() => {
    if (!pwaFlags.installPromptEnabled) return false;
    if (typeof window === "undefined") return false;
    if (isStandaloneMode()) return false;
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return true;
    const dismissedAt = Number(raw);
    return Number.isFinite(dismissedAt) ? Date.now() - dismissedAt >= 1000 * 60 * 60 * 24 * 7 : true;
  });

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      const deferred = event as DeferredBeforeInstallPromptEvent;
      (window as Window & { __actiQDeferredInstallPrompt?: DeferredBeforeInstallPromptEvent }).__actiQDeferredInstallPrompt = deferred;
      setDeferredPrompt(deferred);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const shouldShow = useMemo(
    () => installPromptEligible && Boolean(deferredPrompt || showIosHint),
    [installPromptEligible, deferredPrompt, showIosHint]
  );
  if (!shouldShow) return null;

  async function installNow() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      const now = Date.now();
      localStorage.setItem(DISMISS_KEY, String(now));
      setInstallPromptEligible(false);
    } else {
      const now = Date.now();
      localStorage.setItem(DISMISS_KEY, String(now));
      setInstallPromptEligible(false);
    }
    setDeferredPrompt(null);
  }

  function dismiss() {
    const now = Date.now();
    localStorage.setItem(DISMISS_KEY, String(now));
    setInstallPromptEligible(false);
  }

  return (
    <AlertDialog open={shouldShow} onOpenChange={(open) => !open && dismiss()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Install ActivationIQ</AlertDialogTitle>
          <AlertDialogDescription>
            Add the app to your home screen for faster launch and better offline support.
          </AlertDialogDescription>
          {showIosHint && !deferredPrompt ? (
            <p className="text-xs text-muted-foreground">
              On iPhone: tap Share, then choose &quot;Add to Home Screen&quot;.
            </p>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={dismiss}>Not Now</AlertDialogCancel>
          {deferredPrompt ? (
            <AlertDialogAction onClick={() => void installNow()}>Install App</AlertDialogAction>
          ) : (
            <Button type="button" onClick={dismiss}>
              OK
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
