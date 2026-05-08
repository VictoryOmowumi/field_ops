"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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

export default function InstallAppButton({ className = "" }: { className?: string }) {
  const [deferredPrompt, setDeferredPrompt] = useState<DeferredBeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (!pwaFlags.installPromptEnabled) return;

    const existing = (window as Window & { __actiQDeferredInstallPrompt?: DeferredBeforeInstallPromptEvent }).__actiQDeferredInstallPrompt;
    if (existing) setDeferredPrompt(existing);

    const handler = (event: Event) => {
      event.preventDefault();
      const deferred = event as DeferredBeforeInstallPromptEvent;
      (window as Window & { __actiQDeferredInstallPrompt?: DeferredBeforeInstallPromptEvent }).__actiQDeferredInstallPrompt = deferred;
      setDeferredPrompt(deferred);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function onInstall() {
    if (!pwaFlags.installPromptEnabled) {
      toast.error("Install prompt is currently disabled.");
      return;
    }

    if (isStandaloneMode()) {
      toast.message("App is already installed on this device.");
      return;
    }

    if (deferredPrompt) {
      setInstalling(true);
      try {
        localStorage.removeItem(DISMISS_KEY);
        await deferredPrompt.prompt();
        await deferredPrompt.userChoice;
      } finally {
        setInstalling(false);
      }
      return;
    }

    if (isiOS()) {
      toast.message('To install on iPhone: tap Share, then "Add to Home Screen".');
      return;
    }

    toast.message("Use your browser menu and choose Install app.");
  }

  return (
    <Button type="button" variant="outline" className={className} onClick={() => void onInstall()} disabled={installing}>
      {installing ? "Opening..." : "Install App"}
    </Button>
  );
}

