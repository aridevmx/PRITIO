import { useEffect, useState } from "react";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import { useToast } from "@/components/Toast";
import {
  getAsanaAuthorizeUrl,
  disconnectAsana,
  importAsanaTasks,
  getAsanaConnection,
  type ImportResult,
} from "@/features/integrations/api";
import {
  getObsidianConfig,
  saveObsidianConfig,
  testObsidianConnection,
  writeObsidianNote,
  type ObsidianConfig,
} from "@/lib/obsidianApi";
import { cn } from "@/lib/utils";

export function IntegrationsTab() {
  const { workspaces } = useWorkspace();
  const { toast } = useToast();

  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [selectedWs, setSelectedWs] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);

  const [obsConfig, setObsConfig] = useState<ObsidianConfig>(() => {
    const c = getObsidianConfig();
    return { baseUrl: c.baseUrl, apiKey: c.apiKey };
  });
  const [obsTesting, setObsTesting] = useState(false);
  const [obsSending, setObsSending] = useState(false);
  const [obsTestMsg, setObsTestMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Check connection on mount
  useEffect(() => {
    (async () => {
      const conn = await getAsanaConnection();
      setConnected(!!conn);
      setLoading(false);
    })();
  }, []);

  // Pre-select current workspace
  useEffect(() => {
    if (workspaces.length > 0 && !selectedWs) {
      setSelectedWs(workspaces[0].id);
    }
  }, [workspaces, selectedWs]);

  async function handleConnect() {
    const state = crypto.randomUUID();
    sessionStorage.setItem("pritio-asana-oauth-state", state);
    const res = await getAsanaAuthorizeUrl(state);
    if ("error" in res) {
      toast.error(res.error);
      return;
    }
    // Open Asana auth URL in a new popup
    const popup = window.open(res.url, "_blank", "width=600,height=700");
    if (!popup) {
      toast.error("Permite ventanas emergentes para conectar");
      return;
    }
    let settled = false;
    const finish = (ok: boolean, message: string) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", onMessage);
      clearInterval(poll);
      if (ok) {
        setConnected(true);
        toast.success(message);
      } else {
        toast.error(message);
      }
    };
    // Listen for the callback posting a message back to this window.
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === "pritio:asana-connected") {
        finish(true, "Conectado con Asana");
      } else if (e.data?.type === "pritio:asana-error") {
        finish(false, e.data?.detail === "state-mismatch"
          ? "La sesión de Asana no coincide — vuelve a intentarlo"
          : "Error al conectar con Asana");
      }
    };
    window.addEventListener("message", onMessage);
    // Fallback: poll as long as the popup is open.
    const poll = setInterval(async () => {
      if (settled) clearInterval(poll);
      if (popup.closed && !settled) {
        clearInterval(poll);
        window.removeEventListener("message", onMessage);
        return;
      }
      const conn = await getAsanaConnection();
      if (conn) finish(true, "Conectado con Asana");
    }, 2000);
    setTimeout(() => clearInterval(poll), 60_000);
  }

  async function handleDisconnect() {
    const res = await disconnectAsana();
    if (!res.ok) {
      toast.error(res.error ?? "Error al desconectar");
      return;
    }
    setConnected(false);
    setResult(null);
    toast.success("Asana desconectado");
  }

  async function handleImport() {
    if (!selectedWs) return;
    setImporting(true);
    setResult(null);
    try {
      const res = await importAsanaTasks(selectedWs);
      setResult(res);
      if (res.ok) {
        toast.success(`Importadas: ${res.imported} tareas (${res.skipped} duplicadas, ${res.errors} errores)`);
      } else {
        toast.error(res.error ?? "Error al importar");
      }
    } catch {
      toast.error("Error inesperado al importar");
    } finally {
      setImporting(false);
    }
  }

  async function handleTestObsidian() {
    setObsTesting(true);
    setObsTestMsg(null);
    const res = await testObsidianConnection(obsConfig);
    setObsTesting(false);
    setObsTestMsg(
      res.ok
        ? { ok: true, text: res.error ?? "Conectado — la API key es válida." }
        : { ok: false, text: res.error ?? "No se pudo conectar con Obsidian." },
    );
  }

  function handleSaveObsidian() {
    saveObsidianConfig(obsConfig);
    toast.success("Configuración de Obsidian guardada");
  }

  async function handleSendTestNote() {
    if (!obsConfig.apiKey) {
      toast.error("Ingresa la API key antes de enviar una nota");
      return;
    }
    setObsSending(true);
    try {
      const today = new Date().toLocaleDateString("es-MX", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      await writeObsidianNote(
        obsConfig,
        "Pritio/Hola Pritio.md",
        `# Hola Pritio\n\nNota de prueba creada el ${today} desde la app.\n`,
      );
      toast.success("Nota de prueba creada en Obsidian");
    } catch {
      toast.error("No se pudo crear la nota en Obsidian");
    } finally {
      setObsSending(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-pritio-blue" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-muted">Conexiones</p>
        <div className="overflow-hidden rounded-xl border border-line bg-surface-muted">
          <div className="px-3.5 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" fill="currentColor" className="text-pritio-green" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">Asana</p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {connected ? "Conectado — importa tus tareas de Asana" : "No conectado"}
                </p>
              </div>
              {connected ? (
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="shrink-0 rounded-xl border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:bg-surface-subtle transition-colors"
                >
                  Desconectar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleConnect}
                  className="shrink-0 rounded-xl bg-ink px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                >
                  Conectar
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {connected && (
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-muted">Importar tareas</p>
          <div className="overflow-hidden rounded-xl border border-line bg-surface-muted">
            <div className="px-3.5 py-3">
              <p className="text-sm font-medium text-ink">Selecciona el workspace destino</p>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
                Las tareas se importarán como tareas pendientes en el cuadrante "Después".
              </p>
              <select
                value={selectedWs}
                onChange={(e) => setSelectedWs(e.target.value)}
                className="mt-3 w-full rounded-xl border border-line bg-surface-subtle px-3.5 py-2 text-sm text-ink outline-none transition-colors focus:border-pritio-blue focus:ring-1 focus:ring-pritio-blue/20"
              >
                <option value="">Selecciona un workspace</option>
                {workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleImport}
                disabled={!selectedWs || importing}
                className="mt-3 rounded-xl border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-surface-subtle transition-colors disabled:opacity-50"
              >
                {importing ? "Importando..." : "Importar tareas de Asana"}
              </button>
            </div>
          </div>

          {result && result.ok && (
            <div className="mt-3 rounded-xl border border-pritio-green/30 bg-pritio-green/5 px-3.5 py-3">
              <p className="text-sm font-medium text-pritio-green">Importación completada</p>
              <div className="mt-1 flex gap-4 text-xs text-ink-soft">
                <span>{result.imported} importadas</span>
                <span>{result.skipped} omitidas</span>
                <span>{result.errors} errores</span>
                <span>{result.projectsCount} proyectos</span>
              </div>
            </div>
          )}
        </div>
      )}

      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-muted">Obsidian (local)</p>
        <div className="overflow-hidden rounded-xl border border-line bg-surface-muted">
          <div className="px-3.5 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M12 3c-2.5 1-4 3-4 6v2H6a2 2 0 00-2 2v6a2 2 0 002 2h12a2 2 0 002-2v-6a2 2 0 00-2-2h-2V9c0-3-1.5-5-4-6z" fill="currentColor" className="text-pritio-purple" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">Obsidian (Local REST API)</p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
                  Conecta tu bóveda local (solo de escritorio): escribe notas markdown y abre
                  archivos desde Pritio. Requiere el plugin "Local REST API (with MCP)" en Obsidian.
                </p>
              </div>
            </div>

            <div className="mt-3 space-y-2">
              <label className="block">
                <span className="text-xs font-semibold text-ink-soft">URL del servidor</span>
                <input
                  type="url"
                  value={obsConfig.baseUrl}
                  onChange={(e) => setObsConfig((prev) => ({ ...prev, baseUrl: e.target.value }))}
                  placeholder="https://127.0.0.1:27124"
                  autoComplete="off"
                  spellCheck={false}
                  className="mt-1 w-full rounded-xl border border-line bg-surface-subtle px-3.5 py-2 text-sm text-ink outline-none transition-colors focus:border-pritio-purple focus:ring-1 focus:ring-pritio-purple/20"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-ink-soft">API key</span>
                <input
                  type="password"
                  value={obsConfig.apiKey}
                  onChange={(e) => setObsConfig((prev) => ({ ...prev, apiKey: e.target.value }))}
                  placeholder="La muestra Obsidian en Ajustes → Local REST API"
                  autoComplete="off"
                  spellCheck={false}
                  className="mt-1 w-full rounded-xl border border-line bg-surface-subtle px-3.5 py-2 text-sm text-ink outline-none transition-colors focus:border-pritio-purple focus:ring-1 focus:ring-pritio-purple/20"
                />
              </label>
              <p className="text-[11px] leading-relaxed text-ink-muted">
                Se guarda solo en este dispositivo (localStorage); nunca se sube al servidor. Si el
                certificado autofirmado no es confiable, activa el servidor HTTP inseguro (puerto
                27123) y úsalo como URL.
              </p>
            </div>

            {obsTestMsg && (
              <p
                className={cn(
                  "mt-3 rounded-xl px-3 py-2 text-xs font-medium",
                  obsTestMsg.ok
                    ? "border border-pritio-green/30 bg-pritio-green/5 text-pritio-green"
                    : "border border-pritio-coral/30 bg-pritio-coral/5 text-pritio-coral",
                )}
              >
                {obsTestMsg.text}
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleTestObsidian}
                disabled={!obsConfig.baseUrl || obsTesting}
                className="rounded-xl border border-line px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-surface-subtle disabled:opacity-50"
              >
                {obsTesting ? "Probando..." : "Probar conexión"}
              </button>
              <button
                type="button"
                onClick={handleSaveObsidian}
                disabled={!obsConfig.baseUrl}
                className="rounded-xl border border-line px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-surface-subtle disabled:opacity-50"
              >
                Guardar
              </button>
              <button
                type="button"
                onClick={handleSendTestNote}
                disabled={obsSending || !obsConfig.apiKey}
                className="shrink-0 rounded-xl bg-ink px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {obsSending ? "Enviando..." : "Crear nota de prueba"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
