import { useState } from "react";
import { SegmentedControl } from "@/components/SegmentedControl";
import { useTheme } from "@/lib/useTheme";
import { useTimeFormat, setTimeFormat } from "@/lib/timeFormat";
import { areSoundsEnabled, setSoundsEnabled } from "@/lib/sounds";
import { ToggleRow } from "@/features/account/AccountToggle";
import { useToast } from "@/components/Toast";
import { exportMyData, downloadJson } from "@/features/account/exportData";

export function PreferencesTab() {
  const { theme, setTheme } = useTheme();
  const timeFormat = useTimeFormat();
  const { toast } = useToast();

  const [sounds, setSounds] = useState(areSoundsEnabled());
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const data = await exportMyData();
      downloadJson(data, `prio-datos-${new Date().toISOString().slice(0, 10)}.json`);
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
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-muted">Apariencia</p>
        <div className="rounded-xl border border-line bg-surface-muted px-3.5 py-3">
          <p className="text-sm font-medium text-ink">Tema</p>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">Se aplica en toda la app.</p>
          <SegmentedControl
            value={theme}
            onChange={(t) => setTheme(t as "light" | "dark")}
            options={[
              { value: "light", label: "Claro" },
              { value: "dark", label: "Oscuro" },
            ]}
            className="mt-3"
          />
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
