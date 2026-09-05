/**
 * Detección del entorno nativo (Capacitor) y puente a sus plugins.
 *
 * Replica el patrón de `desktop.ts`: en web todo cae a fallbacks no-op para
 * que la web siga funcionando sin cambios. Solo el import de `@capacitor/core`
 * es estático (módulo mínimo y seguro en web); los plugins específicos se
 * cargan con import dinámico para NO inflar el bundle web/PWA.
 */

import { Capacitor } from "@capacitor/core";

export function isNative(): boolean {
  return typeof Capacitor !== "undefined" && Capacitor.isNativePlatform();
}

/**
 * Escucha deep links entrantes (magic link, recuperación de contraseña).
 * Devuelve una función para desuscribirse.
 */
export function onNativeDeepLink(callback: (url: string) => void): () => void {
  if (!isNative()) return () => {};
  let remove: (() => void) | undefined;
  void import("@capacitor/app").then(({ App }) => {
    void App.addListener("appUrlOpen", (data) => {
      callback(data.url);
    }).then((handle) => {
      remove = () => void handle.remove();
    });
  });
  return () => remove?.();
}

/**
 * Copia texto al portapapeles. En nativo usa el plugin Capacitor; en web
 * cae a `navigator.clipboard` (que en el WebView puede no estar disponible).
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!isNative()) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
  try {
    const { Clipboard } = await import("@capacitor/clipboard");
    await Clipboard.write({ string: text });
    return true;
  } catch {
    return false;
  }
}
