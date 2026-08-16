import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { APP_NAME, APP_VERSION, APP_TAGLINE, APP_URL } from "@/lib/branding";
import { promptInstall, subscribeInstallPrompt } from "@/lib/installPrompt";
import {
  getDesktopApi,
  isDesktop,
  type UpdateStatus,
} from "@/lib/desktop";

const REPO_URL = "https://github.com/aridevmx/PRITIO";

function updateMessage(status: UpdateStatus | null): string {
  switch (status?.status) {
    case "checking":
      return "Buscando actualizaciones...";
    case "available":
      return `Actualización v${status.version} disponible. Descargando...`;
    case "downloading":
      return `Descargando actualización... ${status.percent}%`;
    case "downloaded":
      return `Actualización v${status.version} lista para instalar.`;
    case "not-available":
      return `Estás al día (v${APP_VERSION}).`;
    case "error":
      return `No se pudo revisar actualizaciones: ${status.message}`;
    case "disabled":
      return "Las actualizaciones automáticas no están disponibles en esta versión.";
    default:
      return "Pulsa buscar para revisar si hay una versión nueva.";
  }
}

export function AboutTab() {
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    return subscribeInstallPrompt(setCanInstall);
  }, []);

  useEffect(() => {
    if (!isDesktop()) return;
    let mounted = true;
    const api = getDesktopApi();

    api.getUpdateStatus().then((status) => {
      if (mounted) setUpdateStatus(status);
    });
    const unsubscribe = api.onUpdateStatus(setUpdateStatus);

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  async function handleCheck() {
    setChecking(true);
    try {
      setUpdateStatus(await getDesktopApi().checkForUpdates());
    } finally {
      setChecking(false);
    }
  }

  function handleInstall() {
    getDesktopApi().installUpdate();
  }

  async function handlePwaInstall() {
    setInstalling(true);
    try {
      await promptInstall();
    } finally {
      setInstalling(false);
    }
  }

  return (
    <div className="space-y-7">
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-surface-muted px-5 py-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-pritio-green to-pritio-blue text-2xl font-black text-white shadow-sm">
          {APP_NAME.charAt(0)}
        </div>
        <div>
          <h3 className="text-lg font-bold text-ink">{APP_NAME}</h3>
          <p className="mt-0.5 text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Versión {APP_VERSION}
          </p>
        </div>
        <p className="max-w-xs text-sm leading-relaxed text-ink-muted">{APP_TAGLINE}</p>
      </div>

      <div className="overflow-hidden rounded-xl border border-line divide-y divide-line bg-surface-muted">
        {isDesktop() && (
          <div className="px-3.5 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-ink">Actualizaciones</p>
              <button
                type="button"
                onClick={handleCheck}
                disabled={checking}
                className="shrink-0 rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {checking ? "Buscando..." : "Buscar actualizaciones"}
              </button>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">
              {updateMessage(updateStatus)}
            </p>
            {updateStatus?.status === "downloaded" && (
              <button
                type="button"
                onClick={handleInstall}
                className="mt-2 w-full rounded-lg bg-pritio-blue px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-pritio-blue/90"
              >
                Reiniciar e instalar ahora
              </button>
            )}
          </div>
        )}

        {!isDesktop() && canInstall && (
          <div className="px-3.5 py-3">
            <button
              type="button"
              onClick={handlePwaInstall}
              disabled={installing}
              className="w-full rounded-lg bg-pritio-green px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-pritio-green/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {installing ? "Instalando..." : `Instalar ${APP_NAME} en este dispositivo`}
            </button>
          </div>
        )}

        <Link
          to="/download"
          className="flex items-center justify-between px-3.5 py-3 transition-colors hover:bg-surface-subtle"
        >
          <span className="text-sm font-medium text-ink">Descargar para otros dispositivos</span>
          <span className="text-xs text-ink-muted">Windows · Linux · macOS ↗</span>
        </Link>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between px-3.5 py-3 transition-colors hover:bg-surface-subtle"
        >
          <span className="text-sm font-medium text-ink">Código fuente</span>
          <span className="text-xs text-ink-muted">GitHub ↗</span>
        </a>
        <a
          href={APP_URL}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between px-3.5 py-3 transition-colors hover:bg-surface-subtle"
        >
          <span className="text-sm font-medium text-ink">Sitio oficial</span>
          <span className="text-xs text-ink-muted">app.pritio.com.mx ↗</span>
        </a>
        <div className="px-3.5 py-3">
          <p className="text-sm font-medium text-ink">Licencia</p>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
            Código abierto para uso personal y autoalojado. El servicio cloud
            puede ser de pago.
          </p>
        </div>
        <div className="px-3.5 py-3">
          <p className="text-sm font-medium text-ink">Calendarios externos</p>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
            Google Calendar y otros calendarios externos llegarán próximamente.
          </p>
        </div>
      </div>
    </div>
  );
}
