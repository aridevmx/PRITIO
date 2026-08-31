import { useCallback, useEffect, useState } from "react";

/**
 * Temas de color (presets de acento).
 *
 * A diferencia del tema claro/oscuro (luminosidad), un "tema de color" cambia
 * la paleta de acentos PRITIO (--pritio-*-rgb) vía `data-theme` en el
 * `<html>`. Los temas `free` están disponibles para todos; los `paid` exigen
 * plan Pro (`hasFeature("premium_themes")`).
 *
 * El preset "default" no aplica ningún override (usa la paleta base).
 */

export type AppThemeId =
  | "default"
  | "ocean"
  | "sunset"
  | "forest"
  | "midnight";

export interface AppThemeDef {
  id: AppThemeId;
  name: string;
  paid: boolean;
  /** 3 colores representativos para la muestra visual. */
  swatch: [string, string, string];
  description: string;
}

export const APP_THEMES: AppThemeDef[] = [
  {
    id: "default",
    name: "Clásico",
    paid: false,
    swatch: ["#4FC38A", "#5BA7D1", "#9B7EDC"],
    description: "La paleta original de Pritio.",
  },
  {
    id: "ocean",
    name: "Océano",
    paid: false,
    swatch: ["#22A8BF", "#2383DE", "#6C6DE3"],
    description: "Tonalidades azuladas y frescas.",
  },
  {
    id: "sunset",
    name: "Atardecer",
    paid: true,
    swatch: ["#F79437", "#F05652", "#EF6C8F"],
    description: "Cálido y energético.",
  },
  {
    id: "forest",
    name: "Bosque",
    paid: true,
    swatch: ["#28B374", "#2D988A", "#7A9661"],
    description: "Naturaleza y calma.",
  },
  {
    id: "midnight",
    name: "Medianoche",
    paid: true,
    swatch: ["#60A9E8", "#8271F6", "#9E6AE8"],
    description: "Índigo profundo y sofisticado.",
  },
];

export function isPremiumTheme(id: AppThemeId): boolean {
  return APP_THEMES.find((t) => t.id === id)?.paid ?? false;
}

export function getThemeName(id: AppThemeId): string {
  return APP_THEMES.find((t) => t.id === id)?.name ?? "Clásico";
}

const STORAGE_KEY = "pritio-app-theme";
const EVENT = "pritio:appThemeChanged";

export function getAppTheme(): AppThemeId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as AppThemeId | null;
    return stored && APP_THEMES.some((t) => t.id === stored) ? stored : "default";
  } catch {
    return "default";
  }
}

export function setAppTheme(id: AppThemeId): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
  applyAppThemeToDom(id);
  window.dispatchEvent(new CustomEvent(EVENT));
}

function applyAppThemeToDom(id: AppThemeId): void {
  const root = document.documentElement;
  if (id === "default") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", id);
}

export function useAppTheme() {
  const [theme, setThemeState] = useState<AppThemeId>(getAppTheme);

  useEffect(() => {
    applyAppThemeToDom(theme);
  }, [theme]);

  useEffect(() => {
    const sync = () => setThemeState(getAppTheme());
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);

  const setTheme = useCallback((id: AppThemeId) => {
    setThemeState(id);
    setAppTheme(id);
  }, []);

  return { theme, setTheme };
}
