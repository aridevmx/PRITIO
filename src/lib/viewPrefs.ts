import { useCallback, useEffect, useState } from "react";
import type { ViewKey } from "@/components/layout/ViewTabs";

const STORAGE_KEY = "pritio:hiddenViews";
const INBOX_VIEWS_KEY = "pritio:inboxHiddenViews";

export const HIDEABLE_VIEWS: ViewKey[] = ["plan", "kanban"];

export const FIXED_VIEWS: ViewKey[] = ["cuadrantes", "calendario", "indicadores"];

// Inbox-specific view toggles
export const INBOX_HIDEABLE_VIEWS = ["inbox-plan", "inbox-board", "inbox-list"] as const;
export type InboxViewKey = (typeof INBOX_HIDEABLE_VIEWS)[number];

let cache: ViewKey[] | null = null;
let inboxCache: InboxViewKey[] | null = null;
const listeners = new Set<() => void>();
const inboxListeners = new Set<() => void>();

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

function readInbox(): InboxViewKey[] {
  if (inboxCache) return inboxCache;
  try {
    const raw = localStorage.getItem(INBOX_VIEWS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    inboxCache = Array.isArray(parsed)
      ? parsed.filter((v): v is InboxViewKey => INBOX_HIDEABLE_VIEWS.includes(v as InboxViewKey))
      : [];
  } catch {
    inboxCache = [];
  }
  return inboxCache;
}

function writeInbox(views: InboxViewKey[]): void {
  inboxCache = views;
  try {
    localStorage.setItem(INBOX_VIEWS_KEY, JSON.stringify(views));
  } catch {
    /* localStorage no disponible — ignorar */
  }
  inboxListeners.forEach((l) => l());
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

export function useInboxViewPrefs() {
  const [hiddenViews, setHiddenViews] = useState<InboxViewKey[]>(readInbox);

  useEffect(() => {
    const listener = () => setHiddenViews(readInbox());
    inboxListeners.add(listener);
    return () => {
      inboxListeners.delete(listener);
    };
  }, []);

  const toggleView = useCallback((view: InboxViewKey) => {
    const next = readInbox();
    const has = next.includes(view);
    writeInbox(has ? next.filter((v) => v !== view) : [...next, view]);
  }, []);

  const isHidden = useCallback((view: InboxViewKey) => readInbox().includes(view), []);

  return { hiddenViews, toggleView, isHidden } as const;
}
