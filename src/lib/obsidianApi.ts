/**
 * Conector a Obsidian vía el plugin comunitario "Local REST API (with MCP)"
 * (coddingtonbear/obsidian-local-rest-api).
 *
 * No existe una API oficial en la nube para Obsidian: la bóveda se expone
 * únicamente en local. El plugin levanta:
 *   - HTTPS https://127.0.0.1:27124/  (certificado autofirmado)
 *   - HTTP  http://127.0.0.1:27123/   (si se habilita "Enable HTTP server")
 *
 * Endpoints usados:
 *   GET  /            → estado del servidor (no requiere autenticación)
 *   GET  /vault/      → lista archivos de la raíz
 *   GET  /vault/{path}→ lee un archivo
 *   PUT  /vault/{path}→ crea/sobrescribe (204; body = contenido markdown)
 *   POST /vault/{path}→ hace append al final del archivo
 *   POST /open/{path} → abre el archivo en la UI de Obsidian
 *
 * Autenticación: header `Authorization: Bearer <api-key>` (la muestra el
 * plugin en Ajustes → Local REST API). La clave se guarda SOLO en
 * localStorage (es una herramienta local del equipo); nunca viaja a Supabase.
 */

export interface ObsidianConfig {
  baseUrl: string;
  apiKey: string;
}

const STORAGE_KEY = "pritio-obsidian-config";

export function getObsidianConfig(): ObsidianConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<ObsidianConfig>;
      return {
        baseUrl:
          typeof parsed.baseUrl === "string" && parsed.baseUrl.trim()
            ? parsed.baseUrl.trim().replace(/\/+$/, "")
            : "https://127.0.0.1:27124",
        apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
      };
    }
  } catch {
    /* ignore */
  }
  return { baseUrl: "https://127.0.0.1:27124", apiKey: "" };
}

export function saveObsidianConfig(config: ObsidianConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    /* ignore */
  }
}

export function clearObsidianConfig(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

interface ObsidianServerInfo {
  authenticated: boolean;
  authenticatedUser?: string;
  author?: string;
  pluginVersion?: string;
  obsidianVersion?: string;
}

export interface ObsidianTestResult {
  ok: boolean;
  error?: string;
  info?: ObsidianServerInfo;
}

async function obsidianFetch(
  config: ObsidianConfig,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${config.apiKey}`);
  return fetch(`${config.baseUrl}${path}`, { ...init, headers });
}

function encodePath(filepath: string): string {
  return filepath
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

/**
 * Verifica que el servidor Local REST API esté arriba y que la API key sea
 * válida. El endpoint `/` no requiere token; `/vault/` sí — con eso validamos
 * la credencial sin tocar ningún archivo.
 */
export async function testObsidianConnection(
  config: ObsidianConfig,
): Promise<ObsidianTestResult> {
  if (!config.baseUrl) {
    return { ok: false, error: "Ingresa la URL del servidor local de Obsidian." };
  }
  try {
    const infoRes = await fetch(config.baseUrl + "/");
    const info = (await infoRes.json()) as ObsidianServerInfo;
    if (!config.apiKey) {
      return {
        ok: true,
        error: "Servidor detectado. Ingresa la API key para verificar el acceso.",
        info,
      };
    }
    const authRes = await obsidianFetch(config, "/vault/");
    if (!authRes.ok) {
      return {
        ok: false,
        error: `API key rechazada (HTTP ${authRes.status}). Revísala en Ajustes → Local REST API.`,
        info,
      };
    }
    return { ok: true, info };
  } catch (err) {
    const message =
      err instanceof TypeError
        ? "No se pudo conectar. Revisa que Obsidian tenga el plugin Local REST API activo. Si el certificado autofirmado no es confiable, habilita el servidor HTTP inseguro (puerto 27123) y úsalo como URL."
        : err instanceof Error
          ? err.message
          : "No se pudo conectar con Obsidian.";
    return { ok: false, error: message };
  }
}

/** Lista los archivos de la raíz de la bóveda. */
export async function listObsidianFiles(config: ObsidianConfig): Promise<string[]> {
  const res = await obsidianFetch(config, "/vault/");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { files?: { name: string; path: string; type: string }[] };
  return (body.files ?? []).map((f) => f.name);
}

/** Crea o sobrescribe una nota markdown en la bóveda. */
export async function writeObsidianNote(
  config: ObsidianConfig,
  filepath: string,
  content: string,
): Promise<void> {
  if (!config.apiKey || !config.baseUrl) {
    throw new Error("Obsidian no está configurado.");
  }
  const res = await obsidianFetch(config, `/vault/${encodePath(filepath)}`, {
    method: "PUT",
    headers: { "Content-Type": "text/markdown" },
    body: content,
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`HTTP ${res.status} al escribir la nota.`);
  }
}

/** Agrega contenido al final de una nota (la crea si no existe). */
export async function appendObsidianNote(
  config: ObsidianConfig,
  filepath: string,
  content: string,
): Promise<void> {
  if (!config.apiKey || !config.baseUrl) {
    throw new Error("Obsidian no está configurado.");
  }
  const res = await obsidianFetch(config, `/vault/${encodePath(filepath)}`, {
    method: "POST",
    headers: { "Content-Type": "text/markdown" },
    body: content,
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`HTTP ${res.status} al agregar a la nota.`);
  }
}

/** Abre un archivo en la UI de Obsidian. */
export async function openObsidianNote(
  config: ObsidianConfig,
  filepath: string,
): Promise<void> {
  if (!config.apiKey || !config.baseUrl) {
    throw new Error("Obsidian no está configurado.");
  }
  const res = await obsidianFetch(config, `/open/${encodePath(filepath)}`, {
    method: "POST",
  });
  if (!res.ok && res.status !== 200) {
    throw new Error(`HTTP ${res.status} al abrir la nota.`);
  }
}