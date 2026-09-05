import { APP_URL } from "@/lib/branding";
import { isDesktop } from "@/lib/desktop";
import { isNative } from "@/lib/native";

/**
 * Origen estable de la app para enlaces compartibles (invitaciones) y
 * redirects de auth. En web usa el origin actual; en desktop usa una URL
 * web fija (el origin del wrapper no es un origen HTTP válido). En nativo
 * (Capacitor) se usa la URL web fija para enlaces compartibles.
 */
export function getAppUrl(): string {
  const configured = import.meta.env.VITE_APP_URL;
  if (configured) return configured.replace(/\/+$/, "");
  if (isDesktop() || isNative()) return APP_URL;
  return window.location.origin.replace(/\/+$/, "");
}

/**
 * URLs de redirect para el flujo de auth (magic link / recuperación).
 * En desktop y nativo apuntan al protocolo `pritio://` que registra el
 * wrapper (Electron) o el custom scheme de Capacitor, de modo que el enlace
 * vuelve a la app en lugar de abrir la web. Requiere `pritio://` como URL
 * de redirect permitida en Supabase Auth > URL Configuration.
 */
export function getAuthRedirectUrl(): string {
  if (isDesktop() || isNative()) return "pritio://auth";
  return getAppUrl();
}

export function getResetRedirectUrl(): string {
  if (isDesktop() || isNative()) return "pritio://auth/reset";
  return `${getAppUrl()}/reset-password`;
}
