import { useMemo, useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { listProjects } from "@/features/projects/api";
import { useTasks } from "@/features/tasks/useTasks";
import { parseDateOnly } from "@/features/tasks/dates";
import { StatCard } from "@/components/stats/StatCard";
import { HorizontalBarChart, type BarItem } from "@/components/stats/HorizontalBarChart";
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

function getWeekStart(): Date {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const start = new Date(now);
  start.setDate(diff);
  start.setHours(0, 0, 0, 0);
  return start;
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

  useEffect(() => {
    if (!workspaceId) return;
    void fetchAssignees(workspaceId).then(setAssignees);
    void listProjects(workspaceId).then(setProjects);
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

  const completedThisWeek = useMemo(() => {
    const weekStart = getWeekStart();
    return tasks.filter(
      (t) => t.completed && t.completedAt && new Date(t.completedAt) >= weekStart,
    ).length;
  }, [tasks]);

  const onTimeRate = useMemo(() => {
    const completed = tasks.filter((t) => t.completed && t.completedAt);
    if (completed.length === 0) return 100;
    const onTime = completed.filter((t) => {
      if (!t.dueDate) return true;
      if (!t.completedAt) return false;
      const due = parseDateOnly(t.dueDate);
      const endOfDueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate() + 1);
      return new Date(t.completedAt) <= endOfDueDay;
    });
    return Math.round((onTime.length / completed.length) * 100);
  }, [tasks]);

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

  return (
    <div className="p-4 space-y-6 lg:p-8">
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard value={activeTotal} label="Tareas activas" />
        <StatCard value={completedThisWeek} label="Completadas esta semana" variant="success" />
        <StatCard value={`${onTimeRate}%`} label="Terminadas a tiempo" variant={onTimeRate >= 80 ? "success" : "danger"} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <HorizontalBarChart data={quadrantData} title="Carga por cuadrante" />
        <HorizontalBarChart data={memberData} title="Por responsable" />
      </div>
    </div>
  );
}
