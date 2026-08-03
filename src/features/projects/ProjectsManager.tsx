import { useState, useEffect, useCallback, type FormEvent } from "react";
import { listProjects, createProject, updateProject, deleteProject, getProjectTaskCount } from "@/features/projects/api";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type { Project } from "@/types";

interface ProjectsManagerProps {
  workspaceId: string;
}

const PRESET_COLORS = [
  "#5BA7D1", "#8B5CF6", "#EF4444", "#22C55E",
  "#F59E0B", "#EC4899", "#14B8A6", "#F97316",
];

export function ProjectsManager({ workspaceId }: ProjectsManagerProps) {
  const { toast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [taskCounts, setTaskCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listProjects(workspaceId);
      setProjects(data);
      const counts = await getProjectTaskCount(workspaceId);
      setTaskCounts(counts);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createProject(workspaceId, newName.trim(), newColor);
      toast.success("Proyecto creado");
      setNewName("");
      setShowForm(false);
      await fetchProjects();
    } catch {
      toast.error("Error al crear proyecto");
    } finally {
      setCreating(false);
    }
  }

  async function handleUpdate(id: string) {
    if (!editName.trim()) return;
    try {
      await updateProject(id, { name: editName.trim() });
      toast.success("Proyecto actualizado");
      setEditingId(null);
      await fetchProjects();
    } catch {
      toast.error("Error al actualizar proyecto");
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteProject(deleteTarget.id);
      toast.success("Proyecto eliminado");
      setDeleteTarget(null);
      await fetchProjects();
    } catch {
      toast.error("Error al eliminar proyecto");
    }
  }

  return (
    <div className="space-y-3">
      {loading ? (
        <p className="text-sm text-ink-muted">Cargando...</p>
      ) : projects.length === 0 && !showForm ? (
        <div className="text-center py-6">
          <p className="text-sm text-ink-muted mb-3">Sin proyectos aún</p>
          <button
            onClick={() => setShowForm(true)}
            className="rounded-xl bg-prio-blue px-4 py-2 text-sm font-semibold text-white hover:bg-prio-blue/90 transition-colors"
          >
            Crear primer proyecto
          </button>
        </div>
      ) : (
        <>
          {projects.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-xl border border-line px-3 py-2.5"
            >
              {editingId === p.id ? (
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    autoFocus
                    className="flex-1 rounded-lg border border-line bg-surface-subtle px-2 py-1 text-sm text-ink outline-none focus:border-prio-blue"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleUpdate(p.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                  />
                  <button onClick={() => handleUpdate(p.id)} className="rounded-lg p-1 text-prio-blue hover:bg-prio-blue/10 transition-colors" title="Guardar">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
                      <path d="M13 4L6 12L3 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                    <span className="text-sm font-medium text-ink truncate">{p.name}</span>
                    <span className="shrink-0 text-[10px] text-ink-muted">
                      {taskCounts.get(p.id) ?? 0} tareas
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => { setEditingId(p.id); setEditName(p.name); }}
                      className="rounded-lg p-1 text-ink-muted hover:bg-surface-muted hover:text-ink transition-colors"
                      title="Editar nombre"
                    >
                      <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
                        <path d="M11 2.5C11.3978 2.10217 11.9374 1.87868 12.5 1.87868C12.7761 1.87868 13.05 1.93254 13.305 2.03696C13.5599 2.14138 13.7906 2.294 13.9848 2.48528C14.179 2.67656 14.3343 2.90342 14.4411 3.15475C14.548 3.40608 14.604 3.67677 14.606 3.95286C14.608 4.22895 14.5561 4.50037 14.4532 4.753C14.3503 5.00564 14.1987 5.2344 14.0076 5.428L5.5 14L2 15L3 11.5L11 2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setDeleteTarget(p)}
                      className="rounded-lg p-1 text-ink-muted hover:bg-red-50 hover:text-red-500 transition-colors"
                      title="Eliminar proyecto"
                    >
                      <svg className="h-3.5 w-3.5" viewBox="0 0 12 12" fill="none">
                        <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}

          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line py-2.5 text-sm font-semibold text-ink-muted hover:border-prio-blue hover:text-prio-blue transition-colors"
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                <path d="M8 1V15M1 8H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Nuevo proyecto
            </button>
          )}

          {showForm && (
            <form onSubmit={handleCreate} className="space-y-3 rounded-xl border border-line p-3">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nombre del proyecto"
                autoFocus
                className="w-full rounded-lg border border-line bg-surface-subtle px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-prio-blue"
              />
              <div className="flex gap-1.5 flex-wrap">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewColor(c)}
                    className={`h-6 w-6 rounded-full border-2 transition-all ${
                      newColor === c ? "border-ink scale-110" : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setNewName(""); }}
                  className="flex-1 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink-muted hover:bg-surface-muted transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!newName.trim() || creating}
                  className="flex-1 rounded-lg bg-prio-blue px-3 py-1.5 text-sm font-semibold text-white hover:bg-prio-blue/90 transition-colors disabled:opacity-50"
                >
                  {creating ? "Creando..." : "Crear"}
                </button>
              </div>
            </form>
          )}
        </>
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
