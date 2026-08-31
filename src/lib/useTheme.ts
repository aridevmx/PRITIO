import { useState, useEffect, useCallback, useMemo } from "react";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "pritio-theme";

const prefersDark =
  typeof window !== "undefined"
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;

function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme !== "system") return theme;
  return prefersDark?.matches ? "dark" : "light";
}

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "system";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") return stored;
  return "system";
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", resolveTheme(theme) === "dark");
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);
  const resolvedTheme = useMemo(() => resolveTheme(theme), [theme]);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (theme !== "system" || !prefersDark) return;
    const handler = (e: MediaQueryListEvent) => {
      document.documentElement.classList.toggle("dark", e.matches);
    };
    prefersDark.addEventListener("change", handler);
    return () => prefersDark.removeEventListener("change", handler);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem(STORAGE_KEY, t);
  }, []);

  return { theme, resolvedTheme, setTheme } as const;
}
