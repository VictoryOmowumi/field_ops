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
  const [deferredPrompt, setDeferredPrompt] = useState<DeferredBeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (!pwaFlags.installPromptEnabled) {
      setHidden(true);
      return;
    }
    if (isStandaloneMode()) {
      setHidden(true);
      return;
    }

    const lastDismissed = localStorage.getItem(DISMISS_KEY);
    if (lastDismissed) {
      const age = Date.now() - Number(lastDismissed);
      if (age < 1000 * 60 * 60 * 24 * 7) {
        setHidden(true);
        return;
      }
    }
    setHidden(false);

    const handler = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as DeferredBeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    if (isiOS()) {
      setShowIosHint(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const shouldShow = useMemo(() => !hidden && (deferredPrompt || showIosHint), [hidden, deferredPrompt, showIosHint]);
  if (!shouldShow) return null;

  async function installNow() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setHidden(true);
    } else {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
      setHidden(true);
    }
    setDeferredPrompt(null);
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setHidden(true);
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
              On iPhone: tap Share, then choose "Add to Home Screen".
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
