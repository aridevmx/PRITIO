import { useState } from "react";
import { SegmentedControl } from "@/components/SegmentedControl";
import { useTheme, type Theme } from "@/lib/useTheme";
import { useTimeFormat, setTimeFormat } from "@/lib/timeFormat";
import { areSoundsEnabled, setSoundsEnabled } from "@/lib/sounds";
import { useViewPrefs, useInboxViewPrefs } from "@/lib/viewPrefs";
import { useWidgetPrefs } from "@/lib/widgetPrefs";
import { ToggleRow } from "@/features/account/AccountToggle";
import { useToast } from "@/components/Toast";
import { exportMyData, downloadJson } from "@/features/account/exportData";
import { useAppTheme, APP_THEMES, type AppThemeId } from "@/lib/appTheme";
import { useBilling } from "@/features/billing/BillingProvider";
import { openUpgrade } from "@/features/billing/upgrade";
import { cn } from "@/lib/utils";

export function PreferencesTab() {
  const { theme, setTheme } = useTheme();
  const timeFormat = useTimeFormat();
  const { hiddenViews, toggleView } = useViewPrefs();
  const { hiddenViews: inboxHiddenViews, toggleView: toggleInboxView } = useInboxViewPrefs();
  const { clockVisible, pomodoroVisible, clockShowSeconds, toggleClockVisible, togglePomodoroVisible, setClockShowSeconds } = useWidgetPrefs();
  const { toast } = useToast();
  const { theme: appTheme, setTheme: setAppTheme } = useAppTheme();
  const { hasFeature } = useBilling();

  const [sounds, setSounds] = useState(areSoundsEnabled());
  const [exporting, setExporting] = useState(false);

  const pickAppTheme = (id: AppThemeId) => {
    const target = APP_THEMES.find((t) => t.id === id);
    if (!target) return;
    if (target.paid && !hasFeature("premium_themes")) {
      openUpgrade("premium_themes");
      return;
    }
    setAppTheme(id);
  };

  async function handleExport() {
    setExporting(true);
    try {
      const data = await exportMyData();
      downloadJson(data, `pritio-datos-${new Date().toISOString().slice(0, 10)}.json`);
      toast.success("Descarga iniciada");
    } catch {
      toast.error("Error al exportar tus datos");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-7">
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-muted">Personalizar y temas</p>
        <div className="rounded-xl border border-line bg-surface-muted px-3.5 py-3">
          <p className="text-sm font-medium text-ink">Tema</p>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">Se aplica en toda la app.</p>
          <SegmentedControl
            value={theme}
            onChange={(t) => setTheme(t as Theme)}
            options={[
              { value: "light", label: "Claro" },
              { value: "dark", label: "Oscuro" },
              { value: "system", label: "Sistema" },
            ]}
            className="mt-3"
          />
        </div>

        <div className="mt-3 rounded-xl border border-line bg-surface-muted px-3.5 py-3">
          <p className="text-sm font-medium text-ink">Color del tema</p>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
            Personaliza los acentos de toda la app. Algunos temas requieren el plan Pro.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {APP_THEMES.map((t) => {
              const active = appTheme === t.id;
              const locked = t.paid && !hasFeature("premium_themes");
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => pickAppTheme(t.id)}
                  aria-pressed={active}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                    active
                      ? "border-pritio-purple/50 bg-pritio-purple/10"
                      : "border-line hover:bg-surface-subtle",
                  )}
                >
                  <span className="flex shrink-0 gap-0.5">
                    {t.swatch.map((c) => (
                      <span
                        key={c}
                        className="h-4 w-4 rounded-full ring-1 ring-black/10"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink">{t.name}</span>
                    <span className="block truncate text-[11px] text-ink-muted">{t.description}</span>
                  </span>
                  {locked && (
                    <span className="shrink-0 rounded-full bg-ink/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                      Pro
                    </span>
                  )}
                  {active && (
                    <span className="shrink-0 rounded-full bg-pritio-purple/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-pritio-purple">
                      Activo
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-muted">Preferencias del sistema</p>
        <div className="overflow-hidden rounded-xl border border-line divide-y divide-line bg-surface-muted">
          <div className="px-3.5 py-3">
            <p className="text-sm font-medium text-ink">Formato de hora</p>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
              Se aplica a las horas de las juntas en toda la app.
            </p>
            <SegmentedControl
              value={timeFormat}
              onChange={(f) => setTimeFormat(f)}
              options={[
                { value: "24h", label: "24 h" },
                { value: "12h", label: "12 h" },
              ]}
              className="mt-3"
            />
          </div>
          <ToggleRow
            label="Sonidos"
            description="Sonido al completar una tarea, recibir notificaciones y recordatorios de juntas."
            checked={sounds}
            onChange={() => {
              const next = !sounds;
              setSounds(next);
              setSoundsEnabled(next);
            }}
          />
        </div>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-muted">Vistas</p>
        <div className="overflow-hidden rounded-xl border border-line divide-y divide-line bg-surface-muted">
          <ToggleRow
            label="Plan"
            description="Muestra la vista de planificación (juntas y pendientes de la semana)."
            checked={!hiddenViews.includes("plan")}
            onChange={() => toggleView("plan")}
          />
          <ToggleRow
            label="Tablero (Kanban)"
            description="Muestra la vista de tablero de tareas."
            checked={!hiddenViews.includes("kanban")}
            onChange={() => toggleView("kanban")}
          />
          <div className="px-3.5 py-3">
            <p className="text-sm font-medium text-ink">Vistas fijas</p>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
              Cuadrantes, Calendario e Indicadores siempre están disponibles y no se pueden ocultar.
            </p>
          </div>
        </div>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-muted">Vistas en Inbox</p>
        <div className="overflow-hidden rounded-xl border border-line divide-y divide-line bg-surface-muted">
          <ToggleRow
            label="Plan en Inbox"
            description="Muestra la vista de planificación semanal dentro de Inbox."
            checked={!inboxHiddenViews.includes("inbox-plan")}
            onChange={() => toggleInboxView("inbox-plan")}
          />
          <ToggleRow
            label="Tablero (Kanban) en Inbox"
            description="Muestra la vista de tablero de tareas dentro de Inbox."
            checked={!inboxHiddenViews.includes("inbox-board")}
            onChange={() => toggleInboxView("inbox-board")}
          />
          <ToggleRow
            label="Lista en Inbox"
            description="Muestra la vista de lista con búsqueda y filtros dentro de Inbox."
            checked={!inboxHiddenViews.includes("inbox-list")}
            onChange={() => toggleInboxView("inbox-list")}
          />
        </div>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-muted">Widgets</p>
        <div className="overflow-hidden rounded-xl border border-line divide-y divide-line bg-surface-muted">
          <ToggleRow
            label="Reloj"
            description="Muestra el reloj con timer en la barra lateral."
            checked={clockVisible}
            onChange={toggleClockVisible}
          />
          <div className="px-3.5 py-3">
            <p className="text-sm font-medium text-ink">Segundos en el reloj</p>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
              Añade los segundos al reloj digital.
            </p>
            <SegmentedControl
              value={clockShowSeconds ? "on" : "off"}
              onChange={(v) => setClockShowSeconds(v === "on")}
              options={[
                { value: "off", label: "Ocultar" },
                { value: "on", label: "Mostrar" },
              ]}
              className="mt-3"
            />
          </div>
          <ToggleRow
            label="Pomodoro"
            description="Muestra el pomodoro en los workspaces de trabajo y personal."
            checked={pomodoroVisible}
            onChange={togglePomodoroVisible}
          />
        </div>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-muted">Tus datos</p>
        <div className="overflow-hidden rounded-xl border border-line divide-y divide-line bg-surface-muted">
          <div className="px-3.5 py-3">
            <p className="text-sm font-medium text-ink">Descargar mis datos</p>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
              Exporta tu perfil, workspaces, tareas, días bloqueados e invitaciones en un archivo JSON.
            </p>
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="mt-3 rounded-xl border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-surface-subtle transition-colors disabled:opacity-50"
            >
              {exporting ? "Preparando..." : "Descargar datos"}
            </button>
          </div>
          <div className="px-3.5 py-3">
            <p className="text-sm font-medium text-ink">Cookies y sesión</p>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
              Guardamos tu sesión, el tema y las preferencias localmente. No usamos cookies de terceros
              ni rastreamos tu actividad.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
