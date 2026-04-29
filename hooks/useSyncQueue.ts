"use client";

import { useCallback, useState } from "react";

import { getPendingSyncRecords } from "@/lib/offline/queue";

export function useSyncQueue() {
  const [pendingCount, setPendingCount] = useState(0);

  const refresh = useCallback(async () => {
    const items = await getPendingSyncRecords();
    setPendingCount(items.length);
  }, []);

  return {
    pendingCount,
    refresh,
  };
}
