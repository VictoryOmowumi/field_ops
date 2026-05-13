"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { pwaFlags } from "@/lib/pwa/flags";

export function PwaRuntimeProvider() {
  const [updateReady, setUpdateReady] = useState(false);
  const waitingWorkerRef = useRef<ServiceWorker | null>(null);

  useEffect(() => {
    if (!pwaFlags.offlineReadEnabled && !pwaFlags.offlineWriteEnabled) return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const pathname = window.location.pathname;
    const isAgentRoute = pathname.startsWith("/agent");
    const isSharedRoute = pathname.startsWith("/shared/");

    let mounted = true;
    let refreshing = false;

    async function unregisterAndClearCaches() {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      } catch {
        // no-op
      }
    }

    async function register() {
      if (!isAgentRoute || isSharedRoute) {
        await unregisterAndClearCaches();
        return;
      }
      try {
        const registration = await navigator.serviceWorker.register("/service-worker.js");
        await registration.update();

        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (refreshing) return;
          refreshing = true;
          window.location.reload();
        });

        if (registration.waiting) {
          waitingWorkerRef.current = registration.waiting;
          if (mounted) setUpdateReady(true);
        }

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (
              installing.state === "installed"
              && navigator.serviceWorker.controller
            ) {
              waitingWorkerRef.current = registration.waiting;
              if (mounted) setUpdateReady(true);
            }
          });
        });
      } catch {
        // no-op: SW registration can fail in restrictive browser contexts
      }
    }

    void register();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!updateReady) return;
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/agent")) return;
    toast.info("New app version available.", {
      action: {
        label: "Update",
        onClick: () => {
          waitingWorkerRef.current?.postMessage({ type: "SKIP_WAITING" });
          window.location.reload();
        },
      },
      duration: 12000,
    });
  }, [updateReady]);

  return null;
}
