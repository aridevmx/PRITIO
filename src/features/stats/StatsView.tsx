import { useMemo, useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { listProjects } from "@/features/projects/api";
import { useTasks } from "@/features/tasks/useTasks";
import { parseDateOnly } from "@/features/tasks/dates";
import { localDateStr, todayStr } from "@/lib/utils";
import { StatCard } from "@/components/stats/StatCard";
import { HorizontalBarChart, type BarItem } from "@/components/stats/HorizontalBarChart";
import { QuadrantPieChart } from "@/components/stats/QuadrantPieChart";
import { ReportsDialog } from "@/features/stats/ReportsDialog";
import { TaskFilterBar } from "@/components/layout/TaskFilterBar";
import type { Task, Project } from "@/types";

const QUADRANT_LABELS: Record<string, string> = {
  do: "Haz ahora",
  plan: "Planifica",
  delegate: "Delega",
  later: "Después",
};

const QUADRANT_COLORS: Record<string, string> = {
  do: "#EF4444",
  plan: "#3B82F6",
  delegate: "#22C55E",
  later: "#8B5CF6",
};

const POINTS_PER_TASK = 10;
const POINTS_PER_SUBTASK = 5;

function getWeekStart(): Date {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const start = new Date(now);
  start.setDate(diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

function getMonthStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/** Días consecutivos con al menos una tarea completada (hoy o ayer mantiene viva la racha). */
export function computeStreak(completionDays: Set<string>): number {
  const cursor = new Date();
  if (!completionDays.has(localDateStr(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!completionDays.has(localDateStr(cursor))) return 0;
  }
  let streak = 0;
  while (completionDays.has(localDateStr(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function filterTasks(
  tasks: Task[],
  query: string,
  myTasksOnly: boolean,
  responsableId: string,
  projectId: string,
  profileId: string | undefined,
): Task[] {
  return tasks.filter((t) => {
    if (t.completed) return false;
    if (query) {
      const q = query.toLowerCase();
      if (!t.title.toLowerCase().includes(q)) return false;
    }
    if (myTasksOnly && profileId) {
      const isMyTask = t.createdBy === profileId || t.assigneeIds.includes(profileId);
      if (!isMyTask) return false;
    }
    if (responsableId) {
      if (!t.assigneeIds.includes(responsableId)) return false;
    }
    if (projectId) {
      if (t.projectId !== projectId) return false;
    }
    return true;
  });
}

async function fetchAssignees(workspaceId: string) {
  const { data } = await supabase
    .from("assignees")
    .select("id, name")
    .eq("workspace_id", workspaceId);
  return data ?? [];
}

interface SubtaskRowLite {
  completed: boolean;
  updated_at: string;
}

async function fetchSubtaskRows(workspaceId: string): Promise<SubtaskRowLite[]> {
  try {
    const { data, error } = await supabase
      .from("task_subtasks")
      .select("completed, updated_at")
      .eq("workspace_id", workspaceId);
    if (error) return [];
    return (data ?? []) as SubtaskRowLite[];
  } catch {
    return []; // migración aún no aplicada — no bloquear indicadores
  }
}

interface AttendanceBucket {
  scheduled: number;
  attended: number;
}

function attendanceFor(tasks: Task[], kind: "meeting" | "event", from: Date, to?: Date): AttendanceBucket {
  let scheduled = 0;
  let attended = 0;
  tasks.forEach((t) => {
    if (t.kind !== kind || !t.startDate) return;
    const d = parseDateOnly(t.startDate);
    if (d < from) return;
    if (to && d >= to) return;
    scheduled += 1;
    if (t.completed) attended += 1;
  });
  return { scheduled, attended };
}

interface StatsViewProps {
  workspaceId: string;
}

export function StatsView({ workspaceId }: StatsViewProps) {
  const { tasks } = useTasks(workspaceId);
  const [searchQuery, setSearchQuery] = useState("");
  const [myTasksOnly, setMyTasksOnly] = useState(false);
  const [responsableId, setResponsableId] = useState("");

  const [projectId, setProjectId] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [assignees, setAssignees] = useState<{ id: string; name: string }[]>([]);
  const [subtaskRows, setSubtaskRows] = useState<SubtaskRowLite[]>([]);
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    if (!workspaceId) return;
    void fetchAssignees(workspaceId).then(setAssignees);
    void listProjects(workspaceId).then(setProjects);
    void fetchSubtaskRows(workspaceId).then(setSubtaskRows);
  }, [workspaceId]);

  const assigneeNames = useMemo(() => {
    const map = new Map<string, string>();
    assignees.forEach((a) => map.set(a.id, a.name));
    return map;
  }, [assignees]);

  const filteredTasks = useMemo(
    () => filterTasks(tasks, searchQuery, myTasksOnly, responsableId, projectId, undefined),
    [tasks, searchQuery, myTasksOnly, responsableId, projectId],
  );

  const activeTotal = useMemo(
    () => filteredTasks.length,
    [filteredTasks],
  );

  const completedTasks = useMemo(
    () => tasks.filter((t) => t.completed && t.completedAt),
    [tasks],
  );

  const weekStart = getWeekStart();

  const completedThisWeek = useMemo(
    () => completedTasks.filter((t) => new Date(t.completedAt as string) >= weekStart).length,
    [completedTasks, weekStart],
  );

  // ─── Racha y puntos ──────────────────────────────────────

  const streak = useMemo(() => {
    const days = new Set<string>();
    completedTasks.forEach((t) => days.add(localDateStr(new Date(t.completedAt as string))));
    return computeStreak(days);
  }, [completedTasks]);

  const pointsTotal = useMemo(
    () =>
      completedTasks.length * POINTS_PER_TASK +
      subtaskRows.filter((s) => s.completed).length * POINTS_PER_SUBTASK,
    [completedTasks, subtaskRows],
  );

  const pointsThisWeek = useMemo(
    () =>
      completedTasks.filter((t) => new Date(t.completedAt as string) >= weekStart).length *
        POINTS_PER_TASK +
      subtaskRows.filter(
        (s) => s.completed && new Date(s.updated_at) >= weekStart,
      ).length *
        POINTS_PER_SUBTASK,
    [completedTasks, subtaskRows, weekStart],
  );

  const onTimeRate = useMemo(() => {
    if (completedTasks.length === 0) return 100;
    const onTime = completedTasks.filter((t) => {
      if (!t.dueDate) return true;
      if (!t.completedAt) return false;
      const due = parseDateOnly(t.dueDate);
      const endOfDueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate() + 1);
      return new Date(t.completedAt) <= endOfDueDay;
    });
    return Math.round((onTime.length / completedTasks.length) * 100);
  }, [completedTasks]);

  // ─── Juntas y eventos ────────────────────────────────────

  const todayStart = useMemo(() => new Date(`${todayStr()}T00:00:00`), []);
  const tomorrowStart = useMemo(() => {
    const d = new Date(todayStart);
    d.setDate(d.getDate() + 1);
    return d;
  }, [todayStart]);
  const weekEnd = useMemo(() => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    return d;
  }, [weekStart]);
  const monthStart = getMonthStart();
  const monthEnd = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }, []);

  const meetingsToday = useMemo(() => attendanceFor(tasks, "meeting", todayStart, tomorrowStart), [tasks, todayStart, tomorrowStart]);
  const meetingsWeek = useMemo(() => attendanceFor(tasks, "meeting", weekStart, weekEnd), [tasks, weekStart, weekEnd]);
  const meetingsMonth = useMemo(() => attendanceFor(tasks, "meeting", monthStart, monthEnd), [tasks, monthStart, monthEnd]);
  const eventsToday = useMemo(() => attendanceFor(tasks, "event", todayStart, tomorrowStart), [tasks, todayStart, tomorrowStart]);
  const eventsWeek = useMemo(() => attendanceFor(tasks, "event", weekStart, weekEnd), [tasks, weekStart, weekEnd]);
  const eventsMonth = useMemo(() => attendanceFor(tasks, "event", monthStart, monthEnd), [tasks, monthStart, monthEnd]);

  const quadrantData: BarItem[] = useMemo(() => {
    const counts: Record<string, number> = { do: 0, plan: 0, delegate: 0, later: 0 };
    filteredTasks.forEach((t) => {
      counts[t.quadrant] = (counts[t.quadrant] ?? 0) + 1;
    });

    return Object.entries(counts).map(([key, count]) => ({
      name: QUADRANT_LABELS[key] ?? key,
      value: count,
      color: QUADRANT_COLORS[key] ?? "#6B7280",
    }));
  }, [filteredTasks]);

  const memberData: BarItem[] = useMemo(() => {
    const counts = new Map<string, number>();
    filteredTasks.forEach((t) => {
      t.assigneeIds.forEach((aid) => {
        counts.set(aid, (counts.get(aid) ?? 0) + 1);
      });
    });

    const items: BarItem[] = [];
    const colors = ["#8B5CF6", "#3B82F6", "#22C55E", "#F59E0B", "#EF4444", "#EC4899"];
    let ci = 0;
    for (const [id, count] of counts) {
      const name = assigneeNames.get(id) ?? "Sin asignar";
      items.push({ name, value: count, color: colors[ci % colors.length] });
      ci++;
    }
    items.sort((a, b) => b.value - a.value);
    return items;
  }, [filteredTasks, assigneeNames]);

  const attendanceRow = (
    label: string,
    buckets: { hoy: AttendanceBucket; semana: AttendanceBucket; mes: AttendanceBucket },
  ) => (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-xl border border-line bg-surface px-4 py-3">
      <p className="w-20 text-sm font-bold text-ink">{label}</p>
      {(
        [
          ["Hoy", buckets.hoy],
          ["Semana", buckets.semana],
          ["Mes", buckets.mes],
        ] as const
      ).map(([period, b]) => (
        <div key={period}>
          <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">{period}</p>
          <p className="mt-0.5 text-sm text-ink">
            <span className="font-extrabold tabular-nums text-pritio-green">{b.attended}</span>
            <span className="text-ink-muted"> / {b.scheduled} asistidas</span>
          </p>
        </div>
      ))}
    </div>
  );

  return (
    <div className="p-4 space-y-6 lg:p-8">
      <div className="flex items-start justify-between gap-3">
        <TaskFilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          myTasksOnly={myTasksOnly}
          onMyTasksChange={setMyTasksOnly}
          responsableId={responsableId}
          onResponsableChange={setResponsableId}
          responsableOptions={assignees}
          projectId={projectId}
          onProjectChange={setProjectId}
          projectOptions={projects}
        />
        <button
          type="button"
          onClick={() => setReportOpen(true)}
          className="shrink-0 rounded-xl bg-ink px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-ink/90"
          title="Generar reporte imprimible"
        >
          <span className="flex items-center gap-1.5">
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
              <path d="M5 6.5V3.25A1.25 1.25 0 016.25 2h3.5A1.25 1.25 0 0111 3.25V6.5M4 9h8a1.5 1.5 0 011.5 1.5v3H11v-1.75a.75.75 0 00-.75-.75h-4.5a.75.75 0 00-.75.75V13.5H2.5v-3A1.5 1.5 0 014 9z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Reporte
          </span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard value={activeTotal} label="Tareas activas" />
        <StatCard
          value={`${streak} ${streak === 1 ? "día" : "días"}`}
          label="Racha de tareas"
          variant={streak > 0 ? "success" : "default"}
        />
        <StatCard
          value={pointsTotal.toLocaleString("es-MX")}
          label={`Puntos (+${pointsThisWeek.toLocaleString("es-MX")} esta semana)`}
          variant="success"
        />
        <StatCard value={completedThisWeek} label="Completadas esta semana" variant="success" />
        <StatCard value={`${onTimeRate}%`} label="Terminadas a tiempo" variant={onTimeRate >= 80 ? "success" : "danger"} />
      </div>

      <div className="space-y-2">
        <h2 className="px-1 text-xs font-bold uppercase tracking-wider text-ink-muted">
          Juntas y eventos
        </h2>
        {attendanceRow("Juntas", { hoy: meetingsToday, semana: meetingsWeek, mes: meetingsMonth })}
        {attendanceRow("Eventos", { hoy: eventsToday, semana: eventsWeek, mes: eventsMonth })}
        <p className="px-1 text-[11px] leading-relaxed text-ink-muted">
          Una junta o evento cuenta como asistida cuando se marca como completada. No suman puntos ni afectan la racha.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <QuadrantPieChart data={quadrantData} title="Carga por cuadrante" />
        <HorizontalBarChart data={memberData} title="Por responsable" />
      </div>

      <ReportsDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        tasks={tasks}
        projects={projects}
        assignees={assignees}
        streak={streak}
      />
    </div>
  );
}
