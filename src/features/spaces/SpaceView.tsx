import { useState } from "react";
import type { SpaceKey } from "@/features/spaces/spaces";
import { SPACES } from "@/features/spaces/spaces";
import { QuadrantsView } from "@/features/tasks/QuadrantsView";
import { CalendarView } from "@/features/calendar/CalendarView";
import { StatsView } from "@/features/stats/StatsView";
import { ViewTabs, type ViewKey } from "@/components/layout/ViewTabs";
import { TaskFormDialog } from "@/features/tasks/TaskFormDialog";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import { cn } from "@/lib/utils";
import type { Task } from "@/types";
import { useTasks } from "@/features/tasks/useTasks";

interface SpaceViewProps {
  space: SpaceKey;
  view: ViewKey;
  onViewChange: (key: ViewKey) => void;
  calendarDate?: string | null;
}

export function SpaceView({ space, view, onViewChange, calendarDate }: SpaceViewProps) {
  const meta = SPACES[space];
  const { currentWorkspace, workspaces } = useWorkspace();
  const { tasks, refresh } = useTasks(currentWorkspace?.id ?? null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const isPendientes = space === "pendientes";
  const activeCount = tasks.filter((t) => !t.completed).length;

  const isPersonal = currentWorkspace?.type === "personal" || space === "personal" || space === "pendientes";
  const availableTabs: ViewKey[] = isPersonal
    ? ["cuadrantes", "calendario"]
    : ["cuadrantes", "calendario", "indicadores"];

  return (
    <div className="flex flex-1 flex-col bg-surface-muted">
      <div className="border-b border-line bg-surface/80 px-8 py-3 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className={cn("text-xs uppercase font-bold", meta.accent.text)}>{meta.label}</p>
            <h1 className="text-2xl font-extrabold text-ink">{meta.subtitle}</h1>
            <p className="text-sm text-ink-muted">{activeCount} tareas activas</p>
          </div>
          <div className="flex items-center gap-3">
            <ViewTabs active={view} onChange={onViewChange} availableTabs={availableTabs} />
            <div className="h-6 w-px bg-line" />
            <button
              onClick={() => {
                setEditingTask(null);
                setTaskDialogOpen(true);
              }}
              className="flex items-center gap-1.5 rounded-lg bg-ink px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-ink/90"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Nueva tarea
            </button>
            <button
              onClick={() => {
                refresh();
                setRefreshKey((k) => k + 1);
              }}
              className="rounded-lg p-2 text-ink-muted hover:bg-surface-muted hover:text-ink-soft transition-colors"
              title="Refrescar"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>
      </div>
      {view === "cuadrantes" && (
        <QuadrantsView
          key={currentWorkspace?.id ?? "none"}
          workspaceIds={isPendientes ? workspaces.map((w) => w.id) : undefined}
          refreshKey={refreshKey}
        />
      )}
      {view === "calendario" && currentWorkspace && <CalendarView workspaceId={currentWorkspace.id} space={space} defaultDate={calendarDate ?? undefined} />}
      {view === "indicadores" && currentWorkspace && <StatsView workspaceId={currentWorkspace.id} />}

      <TaskFormDialog
        open={taskDialogOpen}
        onClose={() => {
          setTaskDialogOpen(false);
          setEditingTask(null);
        }}
        onSaved={() => {
          setTaskDialogOpen(false);
          setEditingTask(null);
          refresh();
        }}
        task={editingTask}
        defaultQuadrant="do"
      />
    </div>
  );
}
