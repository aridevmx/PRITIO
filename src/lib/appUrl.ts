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

/**
 * URLs de redirect para el flujo de auth (magic link / recuperación).
 * En desktop apuntan al protocolo `pritio://` que registra el wrapper de
 * Electron, de modo que el enlace vuelve a la app de escritorio en lugar de
 * abrir la web. Requiere `pritio://` como URL de redirect permitida en
 * Supabase Auth > URL Configuration.
 */
export function getAuthRedirectUrl(): string {
  if (isDesktop()) return "pritio://auth";
  return getAppUrl();
}

export function getResetRedirectUrl(): string {
  if (isDesktop()) return "pritio://auth/reset";
  return `${getAppUrl()}/reset-password`;
}
