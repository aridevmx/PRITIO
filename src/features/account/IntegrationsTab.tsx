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

export function IntegrationsTab() {
  const { workspaces } = useWorkspace();
  const { toast } = useToast();

  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [selectedWs, setSelectedWs] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);

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
    const res = await getAsanaAuthorizeUrl();
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
    // Listen for the callback posting a message back to this window.
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === "pritio:asana-connected") {
        window.removeEventListener("message", onMessage);
        setConnected(true);
        toast.success("Conectado con Asana");
      }
    };
    window.addEventListener("message", onMessage);
    // Fallback: poll as long as the popup is open.
    const poll = setInterval(async () => {
      if (popup.closed) clearInterval(poll);
      const conn = await getAsanaConnection();
      if (conn) {
        clearInterval(poll);
        window.removeEventListener("message", onMessage);
        setConnected(true);
        toast.success("Conectado con Asana");
      }
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
    </div>
  );
}
