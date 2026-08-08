import { useCallback, useEffect, useState } from "react";
import type { ViewKey } from "@/components/layout/ViewTabs";

const STORAGE_KEY = "pritio:hiddenViews";

export const HIDEABLE_VIEWS: ViewKey[] = ["plan", "kanban"];

export const FIXED_VIEWS: ViewKey[] = ["cuadrantes", "calendario", "indicadores"];

let cache: ViewKey[] | null = null;
const listeners = new Set<() => void>();

function read(): ViewKey[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    cache = Array.isArray(parsed)
      ? parsed.filter((v): v is ViewKey => HIDEABLE_VIEWS.includes(v as ViewKey))
      : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(views: ViewKey[]): void {
  cache = views;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
  } catch {
    /* localStorage no disponible — ignorar */
  }
  listeners.forEach((l) => l());
}

export function useViewPrefs() {
  const [hiddenViews, setHiddenViews] = useState<ViewKey[]>(read);

  useEffect(() => {
    const listener = () => setHiddenViews(read());
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const toggleView = useCallback((view: ViewKey) => {
    const next = read();
    const has = next.includes(view);
    write(has ? next.filter((v) => v !== view) : [...next, view]);
  }, []);

  const isHidden = useCallback((view: ViewKey) => read().includes(view), []);

  return { hiddenViews, toggleView, isHidden } as const;
}
