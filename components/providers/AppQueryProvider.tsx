"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export default function AppQueryProvider({
  children,
  liveMode = false,
}: {
  children: React.ReactNode;
  liveMode?: boolean;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: liveMode ? 10_000 : 30_000,
            refetchOnWindowFocus: liveMode,
            refetchOnReconnect: liveMode,
          },
        },
      })
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
