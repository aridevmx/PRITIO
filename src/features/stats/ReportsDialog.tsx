import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { APP_NAME } from "@/lib/branding";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import { cn, todayStr } from "@/lib/utils";
import { parseDateOnly } from "@/features/tasks/dates";
import type { Task, Project } from "@/types";

type PeriodPreset = "week" | "month" | "30d" | "custom";
type ReportSection = "kpis" | "completed" | "pending" | "meetings";

interface ReportsDialogProps {
  open: boolean;
  onClose: () => void;
  tasks: Task[];
  projects: Project[];
  assignees: { id: string; name: string }[];
  streak: number;
}

const QUADRANT_LABELS: Record<string, string> = {
  do: "Haz ahora",
  plan: "Planifica",
  delegate: "Delega",
  later: "Después",
};

const POINTS_PER_TASK = 10;
const POINTS_PER_SUBTASK = 5;

function fmtDate(d: Date): string {
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
}

function periodLabel(preset: PeriodPreset, fromStr: string, toStr: string): string {
  if (preset === "custom") return `${fromStr} — ${toStr}`;
  if (preset === "week") return "Esta semana";
  if (preset === "month") return "Este mes";
  return "Últimos 30 días";
}

export function ReportsDialog({ open, onClose, tasks, projects, assignees, streak }: ReportsDialogProps) {
  const { currentWorkspace } = useWorkspace();

  const [preset, setPreset] = useState<PeriodPreset>("month");
  const [customFrom, setCustomFrom] = useState(todayStr());
  const [customTo, setCustomTo] = useState(todayStr());
  const [scopeProjectId, setScopeProjectId] = useState("");
  const [scopeResponsableId, setScopeResponsableId] = useState("");
  const [sections, setSections] = useState<Record<ReportSection, boolean>>({
    kpis: true,
    completed: true,
    pending: true,
    meetings: true,
  });

  const range = useMemo((): { from: Date; to: Date } => {
    const now = new Date();
    let from: Date;
    if (preset === "week") {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      from = new Date(now.getFullYear(), now.getMonth(), diff);
    } else if (preset === "month") {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (preset === "30d") {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
    } else {
      return {
        from: parseDateOnly(customFrom),
        to: (() => {
          const t = parseDateOnly(customTo);
          t.setDate(t.getDate() + 1); // to exclusivo
          return t;
        })(),
      };
    }
    from.setHours(0, 0, 0, 0);
    const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return { from, to };
  }, [preset, customFrom, customTo]);

  const scoped = useMemo(
    () =>
      tasks.filter((t) => {
        if (scopeProjectId && t.projectId !== scopeProjectId) return false;
        if (scopeResponsableId && !t.assigneeIds.includes(scopeResponsableId)) return false;
        return true;
      }),
    [tasks, scopeProjectId, scopeResponsableId],
  );

  const completedInRange = useMemo(
    () =>
      scoped
        .filter((t) => t.completed && t.completedAt)
        .filter((t) => {
          const d = new Date(t.completedAt as string);
          return d >= range.from && d < range.to;
        })
        .sort((a, b) => (a.completedAt as string).localeCompare(b.completedAt as string)),
    [scoped, range],
  );

  const onTimeCount = useMemo(
    () =>
      completedInRange.filter((t) => {
        if (!t.dueDate) return true;
        const due = parseDateOnly(t.dueDate);
        return new Date(t.completedAt as string) <= new Date(due.getFullYear(), due.getMonth(), due.getDate() + 1);
      }).length,
    [completedInRange],
  );

  const pendingTasks = useMemo(() => scoped.filter((t) => !t.completed), [scoped]);

  const meetingsInRange = useMemo(
    () =>
      scoped.filter((t) => {
        if ((t.kind !== "meeting" && t.kind !== "event") || !t.startDate) return false;
        const d = parseDateOnly(t.startDate);
        return d >= range.from && d < range.to;
      }),
    [scoped, range],
  );
  const attendedCount = meetingsInRange.filter((t) => t.completed).length;

  const perPerson = useMemo(() => {
    const map = new Map<string, number>();
    completedInRange.forEach((t) => {
      t.assigneeIds.forEach((aid) => map.set(aid, (map.get(aid) ?? 0) + 1));
    });
    return assignees
      .filter((a) => map.has(a.id))
      .map((a) => ({ name: a.name, count: map.get(a.id) ?? 0 }))
      .sort((a, b) => b.count - a.count);
  }, [completedInRange, assignees]);

  const projectName = (id: string | null): string => projects.find((p) => p.id === id)?.name ?? "—";

  const assigneeName = (id: string): string => assignees.find((a) => a.id === id)?.name ?? "";

  const pointsInRange = completedInRange.length * POINTS_PER_TASK;

  if (!open) return null;

  const dialog = (
    <div className="reports-overlay fixed inset-0 z-[9997] flex items-center justify-center bg-ink/30 backdrop-blur-sm">
      <div className="flex h-full w-full flex-col overflow-hidden bg-surface md:h-[92vh] md:max-w-4xl md:rounded-2xl md:border md:border-line md:shadow-elevated">
        {/* Barra de acciones */}
        <div className="no-print flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="text-sm font-bold text-ink">Reporte de avance</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-xl bg-ink px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-ink/90"
            >
              Imprimir / PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="grid h-9 w-9 place-items-center rounded-lg text-ink-muted hover:bg-surface-muted"
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {/* Configuración */}
          <div className="no-print mb-6 space-y-4 rounded-xl border border-line bg-surface-subtle p-4">
            <div>
              <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-ink-muted">Período</p>
              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    ["week", "Esta semana"],
                    ["month", "Este mes"],
                    ["30d", "Últimos 30 días"],
                    ["custom", "Personalizado"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPreset(value)}
                    className={cn(
                      "rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors",
                      preset === value
                        ? "border-pritio-blue bg-pritio-blue/10 text-pritio-blue"
                        : "border-line text-ink-soft hover:border-line-strong",
                    )}
                  >
                    {label}
                  </button>
                ))}
                {preset === "custom" && (
                  <span className="flex items-center gap-1.5 text-xs text-ink-soft">
                    <input
                      type="date"
                      value={customFrom}
                      onChange={(e) => setCustomFrom(e.target.value)}
                      aria-label="Desde"
                      className="rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-ink focus:border-pritio-blue focus:outline-none"
                    />
                    a
                    <input
                      type="date"
                      value={customTo}
                      onChange={(e) => setCustomTo(e.target.value)}
                      aria-label="Hasta"
                      className="rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-ink focus:border-pritio-blue focus:outline-none"
                    />
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-ink-muted">Proyecto</span>
                <select
                  value={scopeProjectId}
                  onChange={(e) => setScopeProjectId(e.target.value)}
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-pritio-blue focus:outline-none"
                >
                  <option value="">Todos los proyectos</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-ink-muted">Responsable</span>
                <select
                  value={scopeResponsableId}
                  onChange={(e) => setScopeResponsableId(e.target.value)}
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-pritio-blue focus:outline-none"
                >
                  <option value="">Todos los responsables</option>
                  {assignees.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-ink-muted">Secciones</p>
              <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                {(
                  [
                    ["kpis", "Resumen"],
                    ["completed", "Completadas"],
                    ["pending", "Pendientes"],
                    ["meetings", "Juntas y eventos"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex cursor-pointer items-center gap-1.5 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={sections[key]}
                      onChange={(e) => setSections((prev) => ({ ...prev, [key]: e.target.checked }))}
                      className="accent-pritio-green"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Vista previa del reporte (esto es lo que se imprime) */}
          <article className="report-page mx-auto max-w-3xl rounded-2xl border border-line bg-white px-8 py-8 text-stone-800 shadow-elevated">
            <header className="mb-6 border-b border-stone-200 pb-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-stone-400">{APP_NAME} · Reporte</p>
              <h1 className="mt-1 text-2xl font-extrabold tracking-tight">{currentWorkspace?.name ?? "Workspace"}</h1>
              <p className="mt-1 text-sm text-stone-500">
                {periodLabel(preset, fmtDate(range.from), fmtDate(new Date(range.to.getTime() - 1)))}
                {scopeProjectId ? ` · Proyecto: ${projectName(scopeProjectId)}` : ""}
                {scopeResponsableId ? ` · Responsable: ${assigneeName(scopeResponsableId)}` : ""}
              </p>
            </header>

            {sections.kpis && (
              <section className="mb-7">
                <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-stone-500">Resumen</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { label: "Completadas", value: completedInRange.length },
                    { label: "Pendientes", value: pendingTasks.length },
                    { label: "A tiempo", value: `${completedInRange.length ? Math.round((onTimeCount / completedInRange.length) * 100) : 100}%` },
                    { label: `Puntos (+${POINTS_PER_SUBTASK}/subt.)`, value: pointsInRange.toLocaleString("es-MX") },
                  ].map((kpi) => (
                    <div key={kpi.label} className="rounded-xl border border-stone-200 px-3 py-2.5">
                      <p className="text-xl font-extrabold tabular-nums">{kpi.value}</p>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-stone-500">{kpi.label}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-stone-500">Racha actual: {streak} día(s).</p>
              </section>
            )}

            {sections.completed && (
              <section className="mb-7">
                <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-stone-500">
                  Completadas en el período ({completedInRange.length})
                </h2>
                {completedInRange.length === 0 ? (
                  <p className="text-sm italic text-stone-400">Sin tareas completadas en este período.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {completedInRange.map((t) => (
                      <li key={t.id} className="flex items-baseline gap-2 border-b border-dashed border-stone-100 pb-1.5 text-sm">
                        <span className="font-medium">{t.title}</span>
                        <span className="ml-auto shrink-0 text-xs text-stone-400">
                          {new Date(t.completedAt as string).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
                        </span>
                        <span className="hidden shrink-0 text-xs text-stone-400 sm:inline">· {projectName(t.projectId)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {perPerson.length > 0 && (
                  <p className="mt-3 text-xs text-stone-500">
                    Por persona:{" "}
                    {perPerson.map((p, i) => `${i > 0 ? ", " : ""}${p.name} (${p.count})`).join("")}
                  </p>
                )}
              </section>
            )}

            {sections.pending && (
              <section className="mb-7">
                <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-stone-500">
                  Pendientes ({pendingTasks.length})
                </h2>
                {(["do", "plan", "delegate", "later"] as const).map((quad) => {
                  const list = pendingTasks.filter((t) => t.quadrant === quad);
                  if (list.length === 0) return null;
                  return (
                    <div key={quad} className="mb-3">
                      <p className="text-xs font-bold text-stone-600">
                        {QUADRANT_LABELS[quad]} ({list.length})
                      </p>
                      <ul className="mt-1 space-y-1">
                        {list.slice(0, 15).map((t) => (
                          <li key={t.id} className="flex items-baseline gap-2 text-sm">
                            <span className="h-1.5 w-1.5 shrink-0 translate-y-[-2px] rounded-full bg-stone-300" />
                            <span>{t.title}</span>
                            {t.dueDate && (
                              <span className="ml-auto shrink-0 text-xs text-stone-400">vence {t.dueDate}</span>
                            )}
                          </li>
                        ))}
                        {list.length > 15 && (
                          <li className="pl-3.5 text-xs italic text-stone-400">+{list.length - 15} más…</li>
                        )}
                      </ul>
                    </div>
                  );
                })}
                {pendingTasks.length === 0 && (
                  <p className="text-sm italic text-stone-400">Sin pendientes en este alcance.</p>
                )}
              </section>
            )}

            {sections.meetings && (
              <section className="mb-2">
                <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-stone-500">Juntas y eventos</h2>
                <p className="text-sm text-stone-600">
                  <span className="font-extrabold">{attendedCount}</span> asistidas de{" "}
                  <span className="font-extrabold">{meetingsInRange.length}</span> programadas.
                </p>
                {meetingsInRange.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {meetingsInRange.map((t) => (
                      <li key={t.id} className="flex items-baseline gap-2 text-sm">
                        <span
                          className={cn(
                            "mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full",
                            t.completed ? "bg-emerald-500" : "bg-stone-300",
                          )}
                        />
                        <span>{t.kind === "meeting" ? "Junta" : "Evento"}: {t.title}</span>
                        <span className="ml-auto shrink-0 text-xs text-stone-400">{t.startDate}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            <footer className="mt-6 border-t border-stone-200 pt-3 text-[11px] text-stone-400">
              Generado el {fmtDate(new Date())} con {APP_NAME}.
            </footer>
          </article>
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
