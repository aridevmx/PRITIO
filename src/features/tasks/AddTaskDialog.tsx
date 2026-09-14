import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import { useToast } from "@/components/Toast";
import { parsePlanLimitError } from "@/features/billing/guarded";
import { openUpgrade } from "@/features/billing/upgrade";
import { createTask } from "@/features/tasks/api";
import { allowedKindsForWorkspace } from "@/features/tasks/kinds";
import { QUADRANTS, QUADRANT_ORDER, type QuadrantIconKey } from "@/features/tasks/quadrants";
import { SegmentedControl, type SegmentedOption } from "@/components/SegmentedControl";
import { DatePickerField } from "@/components/DatePickerField";
import { usePopover } from "@/hooks/usePopover";
import { onAppEvent } from "@/lib/appEvents";
import { cn } from "@/lib/utils";
import { listDocs, linkDocToTask, type Doc } from "@/features/docs/api";
import type { CreateTaskPayload, TaskKind, Quadrant } from "@/types";

export interface CreateTaskDialogOptions {
  quadrant?: Quadrant;
  kind?: TaskKind;
  title?: string;
}

const KIND_OPTIONS: Record<TaskKind, { label: string; accent: string }> = {
  task: { label: "Tarea", accent: "text-pritio-blue" },
  meeting: { label: "Junta", accent: "text-pritio-purple" },
  event: { label: "Evento", accent: "text-pritio-coral" },
};

const QUADRANT_ICONS: Record<QuadrantIconKey, ReactNode> = {
  zap: (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
      <path d="M9 1.5L3.5 9H8L7 14.5L12.5 7H8L9 1.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  ),
  calendar: (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
      <rect x="2.5" y="3" width="11" height="10.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 1.5V4.5M10.5 1.5V4.5M2.5 6.5h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  users: (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
      <circle cx="6" cy="5" r="2.2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2.5 13c.5-2.2 2-3.2 3.5-3.2s3 1 3.5 3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="11.2" cy="6" r="1.8" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9.5 13c.4-1.7 1.4-2.5 2.5-2.5 1 0 1.8.6 2.2 1.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  archive: (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
      <path d="M2.5 8h3L7 10h2l1.5-2h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="2.5" y="3" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4 4.5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
};

export function AddTaskDialog() {
  const { currentWorkspace, profile } = useWorkspace();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<TaskKind>("task");
  const [quadrant, setQuadrant] = useState<Quadrant>("do");
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);

  // Notas/documentos a vincular con la tarea.
  const [docs, setDocs] = useState<Doc[]>([]);
  const [linkedDocIds, setLinkedDocIds] = useState<string[]>([]);
  const [docSearch, setDocSearch] = useState("");
  const { anchorRef, panelRef, open: docsOpen, toggle: toggleDocs, close: closeDocs, pos: docsPos } =
    usePopover<HTMLButtonElement>({ align: "right" });

  useEffect(() => {
    return onAppEvent<CreateTaskDialogOptions>("pritio:create-task", (options) => {
      setTitle(options?.title ?? "");
      setKind(options?.kind ?? "task");
      setQuadrant(options?.quadrant ?? "do");
      setDate("");
      setLinkedDocIds([]);
      setDocSearch("");
      setOpen(true);
    });
  }, []);

  useEffect(() => {
    if (!open || !currentWorkspace) return;
    let cancelled = false;
    listDocs(currentWorkspace.id)
      .then((rows) => {
        if (!cancelled) setDocs(rows);
      })
      .catch(() => {
        if (!cancelled) setDocs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, currentWorkspace]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const allowedKinds = useMemo(
    () => allowedKindsForWorkspace(currentWorkspace?.type),
    [currentWorkspace?.type],
  );
  const effectiveKind: TaskKind = allowedKinds.includes(kind) ? kind : "task";

  const kindOptions = allowedKinds.map(
    (k): SegmentedOption<TaskKind> => ({
      value: k,
      label: KIND_OPTIONS[k].label,
      activeClassName: KIND_OPTIONS[k].accent,
    }),
  ) as [SegmentedOption<TaskKind>, SegmentedOption<TaskKind>, ...SegmentedOption<TaskKind>[]];

  const dateAccent: "blue" | "purple" | "coral" =
    effectiveKind === "meeting" ? "purple" : effectiveKind === "event" ? "coral" : "blue";

  const filteredDocs = useMemo(() => {
    const q = docSearch.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter((d) => d.title.toLowerCase().includes(q));
  }, [docs, docSearch]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const value = title.trim();
    if (!value || saving) return;
    if (!currentWorkspace || !profile) return;

    setSaving(true);
    const payload: CreateTaskPayload = {
      workspaceId: currentWorkspace.id,
      title: value,
      quadrant,
      kind: effectiveKind,
      inboxed: false,
      createdBy: profile.id,
      ...(date ? { startDate: date } : {}),
    };
    try {
      const task = await createTask(payload);

      for (const docId of linkedDocIds) {
        try {
          await linkDocToTask(docId, task.id, task.workspaceId);
        } catch {
          // Vincular notas no debe bloquear la creación de la tarea.
        }
      }

      window.dispatchEvent(
        new CustomEvent("pritio:tasks-changed", {
          detail: { task, workspaceId: task.workspaceId },
        }),
      );
      toast.success(
        effectiveKind === "meeting" ? "Junta creada" : effectiveKind === "event" ? "Evento creado" : "Tarea creada",
      );
      setTitle("");
      setLinkedDocIds([]);
      setOpen(false);
    } catch (err) {
      const resource = parsePlanLimitError(err);
      if (resource) {
        openUpgrade(resource);
        return;
      }
      toast.error(err instanceof Error ? err.message : "No se pudo crear la tarea");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center bg-ink/30 backdrop-blur-sm md:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="pritio-modal-enter max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-b-0 border-line bg-surface p-5 shadow-elevated md:mx-4 md:max-h-[90vh] md:max-w-md md:rounded-b-2xl md:border-b md:p-6">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-bold text-ink">Nueva tarea</h3>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Cerrar"
            className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Describe la tarea…"
            aria-label="Título de la tarea"
            autoComplete="off"
            autoFocus
            spellCheck={false}
            disabled={saving}
            className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-base font-medium text-ink shadow-soft outline-none transition placeholder:text-ink-muted focus:border-pritio-blue focus:ring-2 focus:ring-pritio-blue/25"
          />

          <SegmentedControl
            value={effectiveKind}
            onChange={setKind}
            options={kindOptions}
            size="sm"
          />

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-ink-muted">
              Cuadrante
            </p>
            <div className="grid grid-cols-2 gap-2">
              {QUADRANT_ORDER.map((qKey) => {
                const meta = QUADRANTS[qKey];
                const selected = quadrant === qKey;
                return (
                  <button
                    key={qKey}
                    type="button"
                    onClick={() => setQuadrant(qKey)}
                    aria-pressed={selected}
                    className={cn(
                      "flex flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left transition-colors",
                      selected
                        ? cn(meta.classes.borderStrong, meta.classes.softBg, meta.classes.accentText)
                        : "border-line text-ink-soft hover:border-line-strong hover:text-ink",
                    )}
                  >
                    <span className="flex w-full items-center gap-1.5">
                      {QUADRANT_ICONS[meta.iconKey]}
                      <span className="text-sm font-semibold leading-tight">{meta.title}</span>
                    </span>
                    <span className={cn("text-[11px] font-medium leading-tight", selected ? "opacity-80" : "opacity-60")}>
                      {meta.subtitle}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-8 shrink-0 text-[11px] font-medium text-ink-muted">Fecha</span>
            <DatePickerField
              field="fecha-agregar"
              value={date}
              onChange={(d) => setDate(d ?? "")}
              showTime={false}
              accent={dateAccent}
              placeholder="Sin fecha"
              className="min-w-0 flex-1"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="w-8 shrink-0 text-[11px] font-medium text-ink-muted">Notas</span>
            <button
              ref={anchorRef}
              type="button"
              onClick={toggleDocs}
              aria-pressed={docsOpen}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                linkedDocIds.length > 0
                  ? "border-pritio-purple/40 bg-pritio-purple/10 text-pritio-purple"
                  : "border-line text-ink-soft hover:border-pritio-purple/50 hover:bg-surface-muted hover:text-ink",
              )}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
                <path d="M13.5 9.5c0 .8-.7 1.5-1.5 1.5H4l-2.5 2V3c0-.8.7-1.5 1.5-1.5h9c.8 0 1.5.7 1.5 1.5v6.5z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5.5 7h5M5.5 9h3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              <span className="min-w-0">
                {linkedDocIds.length > 0
                  ? `${linkedDocIds.length} ${linkedDocIds.length === 1 ? "nota vinculada" : "notas vinculadas"}`
                  : "Vincular nota (documento)"}
              </span>
            </button>
          </div>

          {docsOpen &&
            createPortal(
              <div
                ref={panelRef}
                className="fixed z-[10002] w-[18rem] max-w-[calc(100vw-1rem)] rounded-xl border border-line bg-surface p-1.5 shadow-elevated"
                style={{
                  top: docsPos?.top ?? -9999,
                  left: docsPos?.left ?? -9999,
                  visibility: docsPos ? "visible" : "hidden",
                }}
              >
                <input
                  value={docSearch}
                  onChange={(e) => setDocSearch(e.target.value)}
                  placeholder="Buscar nota…"
                  aria-label="Buscar nota"
                  autoComplete="off"
                  spellCheck={false}
                  className="mb-1.5 w-full rounded-lg border border-line bg-surface-muted px-2.5 py-1.5 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-pritio-blue"
                />
                <div className="max-h-56 overflow-y-auto">
                  {filteredDocs.length === 0 ? (
                    <p className="px-2 py-3 text-center text-xs text-ink-muted">
                      {docs.length === 0
                        ? "Aún no hay notas. Créalas en la sección Notas."
                        : "Sin resultados."}
                    </p>
                  ) : (
                    filteredDocs.map((d) => {
                      const linked = linkedDocIds.includes(d.id);
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => {
                            setLinkedDocIds((prev) => (linked ? prev.filter((x) => x !== d.id) : [...prev, d.id]));
                            closeDocs();
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-ink transition-colors hover:bg-surface-muted"
                        >
                          <svg className="h-4 w-4 shrink-0 text-pritio-purple/70" viewBox="0 0 16 16" fill="none">
                            <path d="M13.5 9.5c0 .8-.7 1.5-1.5 1.5H4l-2.5 2V3c0-.8.7-1.5 1.5-1.5h9c.8 0 1.5.7 1.5 1.5v6.5z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          <span className="min-w-0 flex-1 truncate">{d.title || "Sin título"}</span>
                          <span
                            className={cn(
                              "grid h-4 w-4 shrink-0 place-items-center rounded border transition-colors",
                              linked ? "border-pritio-purple bg-pritio-purple text-white" : "border-line",
                            )}
                          >
                            {linked && (
                              <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                                <path d="M2.5 6.5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>,
              document.body,
            )}

          <div className="flex items-center gap-3 pt-1">
            <p className="hidden text-xs text-ink-muted sm:block sm:flex-1">
              Enter para crear · Esc para cerrar
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-line px-3.5 py-2 text-sm font-semibold text-ink-soft transition-colors hover:bg-surface-muted hover:text-ink"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!title.trim() || saving}
              className="flex items-center gap-1.5 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving && (
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="2" opacity="0.4" />
                  <path d="M14.5 8A6.5 6.5 0 018 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              )}
              Crear
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}