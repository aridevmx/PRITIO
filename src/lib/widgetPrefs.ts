import { useState, useEffect } from "react";

/**
 * Preferencias y estado efímero de los widgets del sidebar (reloj, pomodoro).
 * Sigue el patrón de localStorage existente (useTheme, timeFormat, sounds).
 *
 * - clockVisible / pomodoroVisible: si el widget se muestra en el sidebar.
 * - clockShowSeconds: mostrar segundos en el reloj digital.
 * - expanded: qué widget está "agrandado" (ninguno | "clock" | "pomodoro").
 *   Solo uno puede estar agrandado a la vez.
 */

const KV = {
  clockVisible: "pritio:clockVisible",
  pomodoroVisible: "pritio:pomodoroVisible",
  clockShowSeconds: "pritio:clockShowSeconds",
} as const;

const EVENT = "pritio:widgetPrefsChanged";

function readBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}

function writeBool(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* localStorage no disponible — ignorar */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function getClockVisible(): boolean {
  return readBool(KV.clockVisible, true);
}
export function setClockVisible(value: boolean): void {
  writeBool(KV.clockVisible, value);
}

export function getPomodoroVisible(): boolean {
  return readBool(KV.pomodoroVisible, true);
}
export function setPomodoroVisible(value: boolean): void {
  writeBool(KV.pomodoroVisible, value);
}

export function getClockShowSeconds(): boolean {
  return readBool(KV.clockShowSeconds, false);
}
export function setClockShowSeconds(value: boolean): void {
  writeBool(KV.clockShowSeconds, value);
}

/** Hook reactivo para las preferencias de widgets guardadas en localStorage. */
export function useWidgetPrefs() {
  const [clockVisible, setClockVisibleState] = useState(getClockVisible);
  const [pomodoroVisible, setPomodoroVisibleState] = useState(getPomodoroVisible);
  const [clockShowSeconds, setClockShowSecondsState] = useState(getClockShowSeconds);

  useEffect(() => {
    const sync = () => {
      setClockVisibleState(getClockVisible());
      setPomodoroVisibleState(getPomodoroVisible());
      setClockShowSecondsState(getClockShowSeconds());
    };
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);

  return {
    clockVisible,
    pomodoroVisible,
    clockShowSeconds,
    toggleClockVisible: () => setClockVisible(!clockVisible),
    togglePomodoroVisible: () => setPomodoroVisible(!pomodoroVisible),
    setClockShowSeconds: (v: boolean) => setClockShowSeconds(v),
  };
}

export type ExpandedWidget = "clock" | "pomodoro" | null;

const EXPANDED_KEY = "pritio:widgetExpanded";

export function getExpandedWidget(): ExpandedWidget {
  try {
    const v = localStorage.getItem(EXPANDED_KEY);
    return v === "clock" || v === "pomodoro" ? v : null;
  } catch {
    return null;
  }
}

export function setExpandedWidget(widget: ExpandedWidget): void {
  try {
    if (widget === null) localStorage.removeItem(EXPANDED_KEY);
    else localStorage.setItem(EXPANDED_KEY, widget);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** Estado compartido de "agrandar": cuando un widget se agranda, el otro se reduce. */
export function useExpandedWidget() {
  const [expanded, setExpanded] = useState<ExpandedWidget>(getExpandedWidget);

  useEffect(() => {
    const sync = () => setExpanded(getExpandedWidget());
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);

  return {
    expanded,
    expand: (widget: ExpandedWidget) => setExpandedWidget(widget),
  };
}
