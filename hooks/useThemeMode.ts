"use client";

import { useSyncExternalStore } from "react";

type ThemeMode = "light" | "dark";

const THEME_KEY = "field-ops-theme";
const THEME_EVENT = "field-ops-theme-change";

function subscribe(onStoreChange: () => void) {
  window.addEventListener(THEME_EVENT, onStoreChange);
  return () => window.removeEventListener(THEME_EVENT, onStoreChange);
}

function getSnapshot(): ThemeMode {
  if (typeof document === "undefined") {
    return "light";
  }

  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function getServerSnapshot(): ThemeMode {
  return "light";
}

function applyTheme(nextTheme: ThemeMode) {
  const root = document.documentElement;
  root.classList.toggle("dark", nextTheme === "dark");
  root.style.colorScheme = nextTheme;
  try {
    window.localStorage.setItem(THEME_KEY, nextTheme);
  } catch {
    // Ignore storage failures (for example private mode/in-app browsers).
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function useThemeMode() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggleTheme = () => {
    applyTheme(theme === "dark" ? "light" : "dark");
  };

  const setTheme = (nextTheme: ThemeMode) => {
    applyTheme(nextTheme);
  };

  return { theme, toggleTheme, setTheme };
}
