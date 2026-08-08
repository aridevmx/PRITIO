import { APP_NAME, APP_VERSION, APP_TAGLINE, APP_URL } from "@/lib/branding";

const REPO_URL = "https://github.com/Pritio/PRITIO";

export function AboutTab() {
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
          <span className="text-xs text-ink-muted">pritio.app ↗</span>
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
