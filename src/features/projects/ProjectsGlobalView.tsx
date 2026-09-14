import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useBilling } from "@/features/billing/BillingProvider";
import { parsePlanLimitError } from "@/features/billing/guarded";
import { openUpgrade } from "@/features/billing/upgrade";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import {
  createProject as apiCreateProject,
  updateProject as apiUpdateProject,
  deleteProject as apiDeleteProject,
  listProjectsByWorkspaces,
  getProjectTaskStatsByWorkspaces,
  getProjectDocCountsByWorkspaces,
  type ProjectTaskStats,
} from "@/features/projects/api";
import type { Project } from "@/types";
import { cn } from "@/lib/utils";

export const PRESET_COLORS = [
  "#5BA7D1", "#8B5CF6", "#EF4444", "#22C55E",
  "#F59E0B", "#EC4899", "#14B8A6", "#F97316",
];

interface ProjectsGlobalViewProps {
  workspaceIds: string[];
}

function formatCreated(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-MX", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export function ProjectsGlobalView({ workspaceIds }: ProjectsGlobalViewProps) {
  const { toast } = useToast();
  const { canCreate } = useBilling();
  const { currentWorkspace, workspaces } = useWorkspace();
  const [projects, setProjects] = useState<Project[]>([]);
  const [taskStats, setTaskStats] = useState<Map<string, ProjectTaskStats>>(new Map());
  const [docCounts, setDocCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);

  const workspaceNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    workspaces.forEach((w) => {
      map[w.id] =
        w.type === "personal" ? "Personal" : w.type === "family" ? "Familia" : "Equipo";
    });
    return map;
  }, [workspaces]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listProjectsByWorkspaces(workspaceIds);
      const [stats, docs] = await Promise.all([
        getProjectTaskStatsByWorkspaces(workspaceIds),
        getProjectDocCountsByWorkspaces(workspaceIds),
      ]);
      setProjects(data);
      setTaskStats(stats);
      setDocCounts(docs);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [workspaceIds]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  // El "+" flotante abre el modal de nuevo proyecto.
  useEffect(() => {
    const onCreate = () => setCreateOpen(true);
    window.addEventListener("pritio:create-project", onCreate);
    return () => window.removeEventListener("pritio:create-project", onCreate);
  }, []);

  const statsFor = (id: string) => taskStats.get(id) ?? { total: 0, pending: 0, done: 0 };

  const getTargetWorkspaceId = () => currentWorkspace?.id ?? workspaceIds[0] ?? "";

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    if (!canCreate("projects")) return;
    setCreating(true);
    try {
      await apiCreateProject(getTargetWorkspaceId(), newName.trim(), newColor);
      toast.success("Proyecto creado");
      setNewName("");
      setCreateOpen(false);
      await fetchAll();
    } catch (err) {
      const resource = parsePlanLimitError(err);
      if (resource) {
        openUpgrade(resource);
        return;
      }
      toast.error("Error al crear proyecto");
    } finally {
      setCreating(false);
    }
  }

  async function handleUpdate(id: string) {
    if (!editName.trim()) return;
    try {
      await apiUpdateProject(id, { name: editName.trim(), color: editColor });
      toast.success("Proyecto actualizado");
      setEditingId(null);
      await fetchAll();
    } catch {
      toast.error("Error al actualizar proyecto");
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await apiDeleteProject(deleteTarget.id);
      toast.success("Proyecto eliminado");
      setDeleteTarget(null);
      await fetchAll();
    } catch {
      toast.error("Error al eliminar proyecto");
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl p-4 lg:p-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Proyectos</h1>
          <p className="text-sm text-ink-muted">
            Todos tus proyectos y sus métricas en un vistazo.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-pritio-blue px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-pritio-blue/90"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
            <path d="M8 1V15M1 8H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Nuevo proyecto
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-line border-t-pritio-blue" />
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-line-strong bg-surface/60 px-6 py-20 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-pritio-blue/10 text-pritio-blue">
            <svg className="h-6 w-6" viewBox="0 0 16 16" fill="none">
              <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3H6l1.5 1.5h5A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5v-7z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
          </span>
          <div>
            <h2 className="text-base font-bold text-ink">Sin proyectos aún</h2>
            <p className="mt-1 max-w-sm text-sm text-ink-muted">
              Agrupa tus tareas por temas: cada proyecto suma tareas, estado y notas vinculadas.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="rounded-xl bg-pritio-blue px-4 py-2 text-sm font-semibold text-white hover:bg-pritio-blue/90"
          >
            Crear primer proyecto
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => {
            const stats = statsFor(p.id);
            const docsCount = docCounts.get(p.id) ?? 0;
            const workspacesType =
              p.workspaceId === currentWorkspace?.id
                ? currentWorkspace?.type
                : workspaces.find((w) => w.id === p.workspaceId)?.type;
            if (editingId === p.id) {
              return (
                <div
                  key={p.id}
                  className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-soft"
                >
                  <div className="flex flex-wrap gap-1.5">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setEditColor(c)}
                        className={cn(
                          "h-6 w-6 rounded-full border-2 transition-all",
                          editColor === c ? "scale-110 border-ink" : "border-transparent",
                        )}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    autoFocus
                    className="w-full rounded-lg border border-line bg-surface-subtle px-3 py-2 text-sm font-medium text-ink outline-none focus:border-pritio-blue"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleUpdate(p.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleUpdate(p.id)}
                      className="flex-1 rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white hover:bg-ink/90"
                    >
                      Guardar
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="flex-1 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-soft hover:bg-surface-muted"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              );
            }
            return (
              <article
                key={p.id}
                className="group flex flex-col rounded-2xl border border-line bg-surface p-4 shadow-soft transition-all hover:-translate-y-0.5 hover:border-line-strong hover:shadow-elevated"
              >
                <div className="flex items-start gap-3">
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `${p.color}1f` }}
                  >
                    <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: p.color }} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-bold text-ink">{p.name}</h3>
                    <p className="text-[11px] font-medium text-ink-muted">
                      {workspaceNameMap[p.workspaceId] ?? "Workspace"} · Creado el {formatCreated(p.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(p.id);
                        setEditName(p.name);
                        setEditColor(p.color);
                      }}
                      aria-label={`Editar ${p.name}`}
                      className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                        <path d="M11 2.5C11.3978 2.10217 11.9374 1.87868 12.5 1.87868C12.7761 1.87868 13.05 1.93254 13.305 2.03696C13.5599 2.14138 13.7906 2.294 13.9848 2.48528C14.179 2.67656 14.3343 2.90342 14.4411 3.15475C14.548 3.40608 14.604 3.67677 14.606 3.95286C14.608 4.22895 14.5561 4.50037 14.4532 4.753C14.3503 5.00564 14.1987 5.2344 14.0076 5.428L5.5 14L2 15L3 11.5L11 2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(p)}
                      aria-label={`Eliminar ${p.name}`}
                      className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-red-50 hover:text-red-500"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                        <path d="M2.5 4.5h11M6.5 2.5v-.75a.75.75 0 01.75-.75h1.5a.75.75 0 01.75.75v.75m3 2l-.6 8.4a1.5 1.5 0 01-1.5 1.35H5.85a1.5 1.5 0 01-1.5-1.35l-.6-8.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="rounded-xl border border-line bg-surface-muted px-2.5 py-2 text-center">
                    <p className="text-lg font-extrabold leading-none text-ink">{stats.total}</p>
                    <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">Tareas</p>
                  </div>
                  <div className="rounded-xl border border-line bg-surface-muted px-2.5 py-2 text-center">
                    <p className="text-lg font-extrabold leading-none text-pritio-coral">{stats.pending}</p>
                    <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">Pendientes</p>
                  </div>
                  <div className="rounded-xl border border-line bg-surface-muted px-2.5 py-2 text-center">
                    <p className="text-lg font-extrabold leading-none text-pritio-green">{stats.done}</p>
                    <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">Completadas</p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-ink-soft">
                    <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none">
                      <path d="M13.5 9.5c0 .8-.7 1.5-1.5 1.5H4l-2.5 2V3c0-.8.7-1.5 1.5-1.5h9c.8 0 1.5.7 1.5 1.5v6.5z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {docsCount} {docsCount === 1 ? "nota" : "notas"}
                  </span>
                  <span
                    className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-muted px-2 py-0.5 text-[11px] font-medium"
                    style={{ color: p.color }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: p.color }} />
                    {workspacesType === "team" ? "Equipo" : workspacesType === "family" ? "Familia" : "Personal"}
                  </span>
                  <span className="ml-auto text-[11px] text-ink-muted">
                    {stats.done > 0 && stats.total > 0
                      ? `${Math.round((stats.done / stats.total) * 100)}% completado`
                      : "Sin progreso"}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {createOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-end justify-center bg-ink/30 backdrop-blur-sm md:items-center"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setCreateOpen(false);
            }}
          >
            <form
              onSubmit={handleCreate}
              className="pritio-modal-enter w-full max-w-md rounded-t-2xl border border-b-0 border-line bg-surface p-5 shadow-elevated md:rounded-b-2xl"
            >
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-bold text-ink">Nuevo proyecto</h3>
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  aria-label="Cerrar"
                  className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
                >
                  <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              <div className="mt-4 space-y-4">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nombre del proyecto"
                  autoFocus
                  autoComplete="off"
                  className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm font-medium text-ink outline-none transition placeholder:text-ink-muted focus:border-pritio-blue"
                />
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-ink-muted">Color</p>
                  <div className="flex flex-wrap gap-1.5">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNewColor(c)}
                        aria-label={`Color ${c}`}
                        className={cn(
                          "h-7 w-7 rounded-full border-2 transition-all",
                          newColor === c ? "scale-110 border-ink" : "border-transparent hover:scale-105",
                        )}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setCreateOpen(false)}
                    className="flex-1 rounded-lg border border-line px-3.5 py-2 text-sm font-semibold text-ink-soft transition-colors hover:bg-surface-muted hover:text-ink"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={!newName.trim() || creating}
                    className="flex-1 rounded-lg bg-pritio-blue px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-pritio-blue/90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {creating ? "Creando…" : "Crear"}
                  </button>
                </div>
              </div>
            </form>
          </div>,
          document.body,
        )}

      <ConfirmDialog
        open={!!deleteTarget}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
        title="Eliminar proyecto"
        description={
          deleteTarget
            ? `¿Eliminar "${deleteTarget.name}"? Las tareas asociadas se quedarán sin proyecto.`
            : ""
        }
        confirmLabel="Eliminar"
        variant="danger"
      />
    </div>
  );
}