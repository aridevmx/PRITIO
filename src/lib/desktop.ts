/**
 * Puente entre la SPA y el wrapper de escritorio (Electron).
 *
 * La preload de Electron expone `window.__PRIO_DESKTOP__` con esta misma
 * forma. En navegador todo cae a fallbacks no-op para que la web siga
 * funcionando sin cambios. Este módulo NO importa nada de `@/` para que
 * también pueda ser compilado por el tsconfig de Electron.
 */

export interface DesktopApi {
  platform: string;
  appVersion: () => Promise<string>;
  shellOpenExternal: (url: string) => Promise<void>;
  notify: (title: string, body: string) => Promise<void>;
  isMainWindowFocused: () => Promise<boolean>;
  getAgentEnabled: () => Promise<boolean>;
  setAgentEnabled: (enabled: boolean) => Promise<boolean>;
  onNewTask: (callback: () => void) => () => void;
}

export function isDesktop(): boolean {
  return typeof window !== "undefined" && !!window.__PRIO_DESKTOP__;
}

const noop = (): Promise<boolean> => Promise.resolve(false);

export const desktopApi: DesktopApi = {
  platform:
    typeof navigator !== "undefined" ? navigator.userAgent : "",
  appVersion: async () => "0.1.0",
  shellOpenExternal: async (url) => {
    window.open(url, "_blank", "noopener,noreferrer");
  },
  notify: async () => {},
  isMainWindowFocused: async () => true,
  getAgentEnabled: noop,
  setAgentEnabled: noop,
  onNewTask: () => () => {},
};

export function getDesktopApi(): DesktopApi {
  if (isDesktop() && window.__PRIO_DESKTOP__) {
    return window.__PRIO_DESKTOP__;
  }
  return desktopApi;
}
