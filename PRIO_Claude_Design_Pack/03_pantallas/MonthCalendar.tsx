import { useMemo, useState } from "react";
import { CalendarOff, ChevronLeft, ChevronRight } from "lucide-react";
import type { Task } from "@/types";
import {
  addMonths,
  buildMonthGrid,
  monthLabel,
  todayMonth,
  WEEKDAY_LABELS,
  type CalendarDay,
} from "@/features/calendar/calendarUtils";
import { cn } from "@/lib/utils";
import { useBlockedDays } from "@/features/blockedDays/useBlockedDays";
import { BlockDayDialog } from "@/features/blockedDays/BlockDayDialog";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import {
  DayDetailDialog,
  SPACE_DOT,
} from "@/features/calendar/DayDetailDialog";

interface MonthCalendarProps {
  /** All tasks to consider — only those with dueDate are placed on the grid */
  tasks: Task[];
  /**
   * Subset opcional para el heatmap (colores de carga). Si se omite,
   * se cuenta sobre `tasks`. El caller pasa aqui las tareas del
   * usuario para que el coloreado refleje su carga personal.
   */
  heatmapTasks?: Task[];
  /** Show the space color dot next to each chip (useful in Pendientes) */
  showSpaceColor?: boolean;
  /** Click handler for tasks (e.g. open edit modal) */
  onTaskClick?: (task: Task) => void;
}

const PREVIEW_LIMIT = 2;

export function MonthCalendar({
  tasks,
  heatmapTasks,
  showSpaceColor = false,
  onTaskClick,
}: MonthCalendarProps) {
  const { activeWorkspace } = useWorkspace();
  const [{ year, month }, setMonth] = useState(todayMonth);
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null);
  // Si hay valor, abre BlockDayDialog con esa fecha pre-seleccionada.
  // Null = dialog cerrado. El bloqueo se pre-marca con el workspace
  // activo ("desde calendario").
  const [blockingDate, setBlockingDate] = useState<string | null>(null);
  // El feature no aplica en workspace personal (sin otros miembros).
  const canBlock =
    !!activeWorkspace && activeWorkspace.type !== "personal";

  const days = useMemo(() => buildMonthGrid(year, month), [year, month]);

  // Bloqueos visibles en el grid actual (mig 0058). Cubrimos el grid
  // entero (incluye filas de relleno del mes anterior/siguiente).
  const gridFrom = days[0]?.iso ?? "";
  const gridTo = days[days.length - 1]?.iso ?? "";
  const { blocksByDay, refresh: refreshBlocks } =
    useBlockedDays({ from: gridFrom, to: gridTo });

  // Group tasks by ISO date (only the ones with due_date)
  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.dueDate) continue;
      const list = map.get(t.dueDate) ?? [];
      list.push(t);
      map.set(t.dueDate, list);
    }
    return map;
  }, [tasks]);

  // Conteo separado para el heatmap (carga del usuario). Si el caller
  // no pasa heatmapTasks, contamos sobre el mismo `tasks` que las
  // chips, manteniendo retrocompat.
  const heatmapCountByDay = useMemo(() => {
    const source = heatmapTasks ?? tasks;
    const map = new Map<string, number>();
    for (const t of source) {
      if (!t.dueDate) continue;
      map.set(t.dueDate, (map.get(t.dueDate) ?? 0) + 1);
    }
    return map;
  }, [heatmapTasks, tasks]);

  const tasksOnSelectedDay = selectedDay
    ? (tasksByDay.get(selectedDay.iso) ?? [])
    : [];

  const totalWithDate = tasks.filter((t) => t.dueDate).length;
  const totalWithoutDate = tasks.length - totalWithDate;

  return (
    <div className="rounded-2xl border border-line bg-white/80 p-4 shadow-soft backdrop-blur-sm">
      {/* Header */}
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-bold tracking-tight text-ink">
          {monthLabel(year, month)}
        </h3>

        <div className="flex items-center gap-1.5">
          <NavButton
            label="Mes anterior"
            onClick={() => setMonth(addMonths(year, month, -1))}
          >
            <ChevronLeft size={14} />
          </NavButton>
          <button
            type="button"
            onClick={() => setMonth(todayMonth())}
            className={cn(
              "rounded-xl border border-line bg-white/70 px-3 py-1.5 text-xs font-medium text-ink-soft transition-all",
              "hover:bg-white hover:text-ink",
            )}
          >
            Hoy
          </button>
          <NavButton
            label="Mes siguiente"
            onClick={() => setMonth(addMonths(year, month, 1))}
          >
            <ChevronRight size={14} />
          </NavButton>
          {canBlock && (
            <button
              type="button"
              onClick={() => {
                const today = new Date().toISOString().slice(0, 10);
                setBlockingDate(today);
              }}
              className={cn(
                "inline-flex items-center gap-1 rounded-xl border border-line bg-white/70 px-2.5 py-1.5 text-xs font-medium text-ink-soft transition-all",
                "hover:bg-white hover:text-ink",
              )}
              title="Bloquear un dia"
            >
              <CalendarOff size={12} />
              <span className="hidden sm:inline">Bloquear dia</span>
            </button>
          )}
        </div>
      </header>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-1.5 px-1 pb-2">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="text-center text-[10px] font-semibold uppercase tracking-wider text-ink-muted"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((day) => {
          const dayTasks = tasksByDay.get(day.iso) ?? [];
          const visibleTasks = dayTasks.slice(0, PREVIEW_LIMIT);
          const hidden = dayTasks.length - visibleTasks.length;
          const dayBlocks = blocksByDay.get(day.iso) ?? [];

          // Heatmap de carga por dia segun el subset del USUARIO.
          // 2-3 amarillo, 4-5 naranja, 6+ rojo. Solo aplica a dias del
          // mes actual. El border/ring de "today" se preserva encima
          // del bg del heatmap para conservar la senal de hoy.
          const heatmapCount = heatmapCountByDay.get(day.iso) ?? 0;
          const heatmapBg =
            day.isCurrentMonth && heatmapCount >= 6
              ? "bg-red-100"
              : day.isCurrentMonth && heatmapCount >= 4
                ? "bg-orange-100"
                : day.isCurrentMonth && heatmapCount >= 2
                  ? "bg-yellow-100"
                  : null;

          return (
            <button
              key={day.iso}
              type="button"
              onClick={() => setSelectedDay(day)}
              className={cn(
                "flex min-h-[80px] flex-col gap-1 rounded-xl border p-1.5 text-left transition-all",
                day.isCurrentMonth
                  ? heatmapBg
                    ? cn(heatmapBg, "border-line hover:border-line-strong")
                    : "border-line bg-white hover:border-line-strong hover:shadow-soft"
                  : "border-line/40 bg-white/30 text-ink-muted",
                day.isToday &&
                  cn(
                    "border-prio-blue ring-1 ring-prio-blue/20",
                    // Si no hay heatmap, restauramos el tint suave de hoy
                    !heatmapBg && "bg-prio-blue/5",
                  ),
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "text-xs font-semibold",
                    day.isToday
                      ? "text-prio-blue"
                      : day.isCurrentMonth
                        ? "text-ink"
                        : "text-ink-muted",
                  )}
                >
                  {day.dayOfMonth}
                </span>
                {dayTasks.length > 0 && (
                  <span className="rounded-full bg-surface-muted px-1.5 text-[9px] font-semibold text-ink-soft">
                    {dayTasks.length}
                  </span>
                )}
              </div>

              <div className="flex flex-1 flex-col gap-0.5">
                {dayBlocks.length > 0 && (
                  <span
                    title={dayBlocks
                      .map(
                        (b) =>
                          `${b.userName ?? b.userEmail ?? "Alguien"} no disponible${b.reason ? `: ${b.reason}` : ""}`,
                      )
                      .join("\n")}
                    className={cn(
                      "inline-flex items-center gap-1 truncate rounded-md border border-amber-200/60 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800",
                      "dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
                    )}
                  >
                    <CalendarOff size={9} className="shrink-0" />
                    <span className="truncate">
                      {dayBlocks.length === 1
                        ? `${firstName(dayBlocks[0].userName) ?? "Alguien"} no disponible`
                        : `${dayBlocks.length} no disponibles`}
                    </span>
                  </span>
                )}
                {visibleTasks.map((task) => (
                  <span
                    key={task.id}
                    title={task.title}
                    className={cn(
                      "truncate rounded-md px-1.5 py-0.5 text-[10px]",
                      day.isCurrentMonth
                        ? "bg-surface-muted text-ink"
                        : "bg-surface-muted/60 text-ink-muted",
                    )}
                  >
                    {showSpaceColor && (
                      <span
                        className={cn(
                          "mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle",
                          SPACE_DOT[task.space] ?? "bg-ink-muted",
                        )}
                      />
                    )}
                    {task.kind === "meeting" && (
                      <span
                        aria-hidden="true"
                        className="mr-0.5 text-prio-blue"
                      >
                        ▶
                      </span>
                    )}
                    {task.title}
                  </span>
                ))}
                {hidden > 0 && (
                  <span className="text-[10px] font-medium text-ink-muted">
                    +{hidden} más
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Tasks without date footer */}
      {totalWithoutDate > 0 && (
        <p className="mt-3 text-[11px] text-ink-muted">
          {totalWithoutDate} tarea{totalWithoutDate === 1 ? "" : "s"} sin fecha
          no aparece{totalWithoutDate === 1 ? "" : "n"} en el calendario.
        </p>
      )}

      {/* Day detail dialog */}
      {selectedDay && (
        <DayDetailDialog
          day={selectedDay}
          tasks={tasksOnSelectedDay}
          blocks={blocksByDay.get(selectedDay.iso) ?? []}
          showSpaceColor={showSpaceColor}
          onBlockDay={
            canBlock ? (iso) => setBlockingDate(iso) : undefined
          }
          onTaskClick={(task) => {
            setSelectedDay(null);
            onTaskClick?.(task);
          }}
          onClose={() => setSelectedDay(null)}
        />
      )}

      {blockingDate && activeWorkspace && (
        <BlockDayDialog
          defaultDate={blockingDate}
          defaultWorkspaceIds={[activeWorkspace.id]}
          onCreated={() => {
            void refreshBlocks();
          }}
          onClose={() => setBlockingDate(null)}
        />
      )}
    </div>
  );
}

/**
 * Devuelve el primer nombre de un fullName. Si llega null o vacio,
 * devuelve null para que el caller use su fallback (email o "Alguien").
 */
function firstName(fullName: string | null): string | null {
  if (!fullName) return null;
  const trimmed = fullName.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0];
}

function NavButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "grid h-8 w-8 place-items-center rounded-xl border border-line bg-white/70 text-ink-soft transition-all",
        "hover:bg-white hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
