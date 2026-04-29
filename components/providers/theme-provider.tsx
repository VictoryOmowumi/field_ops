"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

type ThemeProviderProps = {
  children: ReactNode;
};

export function ThemeProvider({ children }: ThemeProviderProps) {
  useEffect(() => {
    try {
      const savedTheme = window.localStorage.getItem("field-ops-theme");
      if (savedTheme === "dark" || savedTheme === "light") {
        document.documentElement.classList.toggle("dark", savedTheme === "dark");
        document.documentElement.style.colorScheme = savedTheme;
      }
    } catch {
      // Ignore storage access failures in restricted mobile browser contexts.
    }
  }, []);

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      themes={["light", "dark"]}
      storageKey="field-ops-theme"
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
