"use client";

import { useEffect } from "react";

import { db } from "@/lib/offline/db";
import { pwaFlags } from "@/lib/pwa/flags";
import { syncRecord } from "@/lib/offline/sync";

export default function BackgroundSyncProvider() {
  useEffect(() => {
    if (!pwaFlags.backgroundSyncEnabled) return;
    if (typeof window === "undefined") return;

    let syncing = false;
    const runSync = async () => {
      if (syncing) return;
      if (!navigator.onLine) return;
      syncing = true;
      try {
        const queue = await db.syncQueue.toArray();
        for (const item of queue) {
          await syncRecord(item);
        }
      } finally {
        syncing = false;
      }
    };

    const onOnline = () => {
      void runSync();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void runSync();
      }
    };

    const interval = window.setInterval(() => {
      void runSync();
    }, 30000);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    void runSync();

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
