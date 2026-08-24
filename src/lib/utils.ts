import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Return YYYY-MM-DD using local time (never UTC). */
export function localDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Return today's date as YYYY-MM-DD in local time. */
export function todayStr(): string {
  return localDateStr(new Date());
}

function dayOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return localDateStr(d);
}

/** Fecha local yyyy-mm-dd desplazada N días desde hoy. */
export function addDaysStr(days: number): string {
  return dayOffset(days);
}

/** "Hoy", "Mañana" o fecha corta es-MX ("12 ago"). "" para valor vacío. */
export function formatDayLabel(value: string): string {
  if (!value) return "";
  if (value === todayStr()) return "Hoy";
  if (value === dayOffset(1)) return "Mañana";
  const d = new Date(`${value}T00:00:00`);
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

/** Convierte HTML de notas (Tiptap) a texto plano, para previews. */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|blockquote|pre)>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

/** True si el HTML de notas no tiene contenido visible. */
export function isNotesEmpty(html: string | null | undefined): boolean {
  return stripHtml(html) === "";
}
