import { useState, useEffect } from "react";

export type TimeFormat = "24h" | "12h";

const STORAGE_KEY = "prio:timeFormat";
const TIME_FORMAT_EVENT = "prio:timeFormatChanged";

export function getTimeFormat(): TimeFormat {
  try {
    return localStorage.getItem(STORAGE_KEY) === "12h" ? "12h" : "24h";
  } catch {
    return "24h";
  }
}

export function setTimeFormat(format: TimeFormat): void {
  try {
    localStorage.setItem(STORAGE_KEY, format);
  } catch {
    /* localStorage no disponible — ignorar */
  }
  window.dispatchEvent(new CustomEvent(TIME_FORMAT_EVENT, { detail: format }));
}

export function useTimeFormat(): TimeFormat {
  const [format, setFormat] = useState<TimeFormat>(getTimeFormat);
  useEffect(() => {
    const handler = () => setFormat(getTimeFormat());
    window.addEventListener(TIME_FORMAT_EVENT, handler);
    return () => window.removeEventListener(TIME_FORMAT_EVENT, handler);
  }, []);
  return format;
}

export function formatTime(date: Date, format?: TimeFormat): string {
  const fmt = format ?? getTimeFormat();
  if (fmt === "12h") {
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });
}
