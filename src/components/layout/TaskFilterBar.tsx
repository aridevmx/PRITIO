import { cn } from "@/lib/utils";

interface AssigneeOption {
  id: string;
  name: string;
}

interface ProjectOption {
  id: string;
  name: string;
  color: string;
}

interface TaskFilterBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  myTasksOnly?: boolean;
  onMyTasksChange?: (v: boolean) => void;
  responsableId?: string;
  onResponsableChange?: (id: string) => void;
  responsableOptions?: AssigneeOption[];
  projectId?: string;
  onProjectChange?: (id: string) => void;
  projectOptions?: ProjectOption[];
  hideProject?: boolean;
  hideYo?: boolean;
  hideResponsable?: boolean;
}

export function TaskFilterBar({
  searchQuery,
  onSearchChange,
  myTasksOnly = false,
  onMyTasksChange,
  responsableId = "",
  onResponsableChange,
  responsableOptions = [],
  projectId = "",
  onProjectChange,
  projectOptions = [],
  hideProject = false,
  hideYo = false,
  hideResponsable = false,
}: TaskFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap lg:overflow-x-auto">
      <div className="relative flex-1 min-w-[200px] shrink-0 lg:shrink">
        <svg
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar tareas..."
          className="w-full rounded-lg border border-line bg-surface py-2 pl-10 pr-3 text-sm text-ink outline-none placeholder:text-ink-muted transition-colors focus:border-pritio-blue focus:ring-1 focus:ring-pritio-blue/20"
        />
      </div>

      {!hideProject && onProjectChange && (
        <select
          value={projectId}
          onChange={(e) => onProjectChange(e.target.value)}
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink-muted outline-none transition-colors focus:border-pritio-blue focus:ring-1 focus:ring-pritio-blue/20"
        >
          <option value="">Proyecto</option>
          {projectOptions.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      )}

      {!hideYo && onMyTasksChange && (
        <button
          type="button"
          onClick={() => onMyTasksChange(!myTasksOnly)}
          className={cn(
            "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
            myTasksOnly
              ? "border-pritio-blue bg-pritio-blue/10 text-pritio-blue"
              : "border-line text-ink-muted hover:bg-surface-muted",
          )}
        >
          Yo
        </button>
      )}

      {!hideResponsable && onResponsableChange && (
        <select
          value={responsableId}
          onChange={(e) => onResponsableChange(e.target.value)}
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink-muted outline-none transition-colors focus:border-pritio-blue focus:ring-1 focus:ring-pritio-blue/20"
        >
          <option value="">Responsable</option>
          {responsableOptions.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      )}

      <select className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink-muted outline-none transition-colors focus:border-pritio-blue focus:ring-1 focus:ring-pritio-blue/20">
        <option value="">Estado</option>
        <option value="pending">Pendientes</option>
        <option value="completed">Completadas</option>
      </select>

      <select className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink-muted outline-none transition-colors focus:border-pritio-blue focus:ring-1 focus:ring-pritio-blue/20">
        <option value="">Tipo</option>
        <option value="task">Tarea</option>
        <option value="meeting">Junta</option>
      </select>

      <select className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink-muted outline-none transition-colors focus:border-pritio-blue focus:ring-1 focus:ring-pritio-blue/20">
        <option value="">Gestionar</option>
        <option value="select-all">Seleccionar todo</option>
        <option value="clear-all">Limpiar selección</option>
      </select>
    </div>
  );
}
