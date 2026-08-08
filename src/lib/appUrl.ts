import { APP_URL } from "@/lib/branding";
import { isDesktop } from "@/lib/desktop";

/**
 * Origen estable de la app para enlaces compartibles (invitaciones) y
 * redirects de auth. En web usa el origin actual; en desktop usa una URL
 * web fija (el origin del wrapper no es un origen HTTP válido).
 */
export function getAppUrl(): string {
  const configured = import.meta.env.VITE_APP_URL;
  if (configured) return configured.replace(/\/+$/, "");
  if (isDesktop()) return APP_URL;
  return window.location.origin.replace(/\/+$/, "");
}
