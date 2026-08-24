export interface Branding {
  name: string;
  tagline: string;
  url: string;
}

const DEFAULT_NAME = "Pritio";
const DEFAULT_TAGLINE =
  "Tu trabajo, tu casa y lo personal en una sola vista. Prioriza con claridad.";
const DEFAULT_URL = "https://pritio.clipot.com.mx";

/**
 * Resuelve el branding desde variables VITE_* con fallbacks.
 * - En la app (bundle Vite) lee import.meta.env reemplazado en build.
 * - En vite.config (Node puro) recibe el resultado de loadEnv().
 */
export function resolveBranding(
  env: Record<string, string | undefined> = {},
): Branding {
  const name = env.VITE_APP_NAME?.trim() || DEFAULT_NAME;
  const url = (env.VITE_APP_URL?.trim() || DEFAULT_URL).replace(/\/+$/, "");
  return { name, tagline: DEFAULT_TAGLINE, url };
}

const metaEnv =
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

const brand = resolveBranding(metaEnv);

export const APP_NAME = brand.name;

export const APP_VERSION = "0.1.4";

export const APP_TAGLINE = brand.tagline;

export const APP_URL = brand.url;

export const APP_DESCRIPTION = `${APP_NAME} — ${APP_TAGLINE}`;
