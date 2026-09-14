import { useCallback, useEffect, useMemo, useState } from "react";
import { cn, todayStr, addDaysStr } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import { useTasks } from "@/features/tasks/useTasks";
import { TaskCard } from "@/features/tasks/TaskCard";
import { TaskFormDialog } from "@/features/tasks/TaskFormDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SegmentedControl, type SegmentedOption } from "@/components/SegmentedControl";
import { updateTask as apiUpdateTask } from "@/features/tasks/api";
import type { Task } from "@/types";

type DueFilter = "overdue" | "today" | "week" | "none" | "";

const DUE_SEGMENTS: [SegmentedOption<DueFilter>, SegmentedOption<DueFilter>, ...SegmentedOption<DueFilter>[]] = [
  { value: "", label: "Todas" },
  { value: "overdue", label: "Vencidas" },
  { value: "today", label: "Hoy" },
  { value: "week", label: "Semana" },
  { value: "none", label: "Sin fecha" },
];

export function TodasView() {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id ?? null;
  const { tasks, isLoading, updateTask: updateLocalTask, removeTask } = useTasks(
    workspaceId,
    { workspaceType: currentWorkspace?.type },
  );

  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [dueFilter, setDueFilter] = useState<DueFilter>("");
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    supabase
      .from("projects")
      .select("id, name")
      .eq("workspace_id", workspaceId)
      .then(({ data }) => setProjects(data ?? []));
  }, [workspaceId]);

  const activeTasks = useMemo(() => tasks.filter((t) => !t.completed), [tasks]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const today = todayStr();
    const weekEnd = addDaysStr(7);
    return activeTasks.filter((t) => {
      if (q && !t.title.toLowerCase().includes(q)) return false;
      if (projectFilter && t.projectId !== projectFilter) return false;
      if (dueFilter === "overdue" && !(t.dueDate && t.dueDate < today)) return false;
      if (dueFilter === "today" && t.dueDate !== today) return false;
      if (dueFilter === "week" && !(t.dueDate && t.dueDate >= today && t.dueDate <= weekEnd)) return false;
      if (dueFilter === "none" && t.dueDate) return false;
      return true;
    });
  }, [activeTasks, search, projectFilter, dueFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [filtered]);

  const hasFilters = search.trim() !== "" || projectFilter !== "" || dueFilter !== "";
  const clearFilters = () => {
    setSearch("");
    setProjectFilter("");
    setDueFilter("");
  };

  const handleToggleComplete = useCallback(
    async (task: Task) => {
      try {
        const updated = await apiUpdateTask(task.id, { completed: !task.completed });
        updateLocalTask(updated);
      } catch {
        // realtime will sync
      }
    },
    [updateLocalTask],
  );

  const handleDelete = useCallback(
    async (task: Task) => {
      try {
        await removeTask(task.id);
      } catch {
        // realtime will sync
      }
      setDeleteTarget(null);
    },
    [removeTask],
  );

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-line border-t-pritio-blue" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 p-4 lg:p-6">
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-wider text-pritio-blue">Todas</p>
        <h1 className="text-2xl font-extrabold text-ink">Tus tareas</h1>
        <p className="text-sm text-ink-muted">
          {activeTasks.length} activas · {sorted.length} coinciden
        </p>
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
            viewBox="0 0 16 16"
            fill="none"
          >
            <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar tareas..."
            className="w-full rounded-xl border border-line bg-surface py-2.5 pl-9 pr-3 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-pritio-blue focus:ring-2 focus:ring-pritio-blue/20"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            value={dueFilter}
            onChange={(v) => setDueFilter(v as DueFilter)}
            options={DUE_SEGMENTS}
            size="sm"
            pill
          />
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="shrink-0 rounded-xl border border-line bg-surface px-2.5 py-2 text-sm text-ink outline-none focus:border-pritio-blue focus:ring-2 focus:ring-pritio-blue/20"
          >
            <option value="">Todos los proyectos</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="rounded-xl px-3 py-2 text-xs font-semibold text-pritio-blue transition-colors hover:bg-pritio-blue/5"
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      <div className="mt-6">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong bg-surface/60 px-6 py-16 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-pritio-blue/10 text-pritio-blue">
              <svg className="h-6 w-6" viewBox="0 0 20 20" fill="none">
                <rect x="3" y="4" width="14" height="12.5" rx="2" stroke="currentColor" strokeWidth="1.7" />
                <path d="M3 8.5h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                <path d="M7 2.5v3M13 2.5v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </span>
            <h2 className="text-base font-bold text-ink">
              {activeTasks.length === 0 ? "Aún no hay tareas" : "Nada coincide"}
            </h2>
            <p className="max-w-sm text-sm text-ink-muted">
              {activeTasks.length === 0
                ? "Captura algo en Inicio o elige un cuadrante en tu espacio para empezar."
                : "Ajusta o limpia los filtros para ver el resto de tus tareas."}
            </p>
          </div>
        ) : (
          <div className={cn("space-y-2", sorted.length > 12 && "md:grid md:grid-cols-2 md:gap-2.5 md:space-y-0")}>
            {sorted.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                onToggleComplete={handleToggleComplete}
                onEdit={(task) => {
                  setEditingTask(task);
                  setDialogOpen(true);
                }}
                onDelete={setDeleteTarget}
              />
            ))}
          </div>
        )}
      </div>

      <TaskFormDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditingTask(null);
        }}
        onSaved={(saved) => {
          setDialogOpen(false);
          setEditingTask(null);
          updateLocalTask(saved);
        }}
        task={editingTask}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Eliminar tarea"
        description={`¿Eliminar "${deleteTarget?.title ?? ""}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        variant="danger"
      />
    </div>
  );
}