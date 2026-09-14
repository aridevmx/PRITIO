import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn, localDateStr, todayStr } from "@/lib/utils";
import { formatTime, useTimeFormat } from "@/lib/timeFormat";
import { supabase } from "@/lib/supabase";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import { useTasks } from "@/features/tasks/useTasks";
import { isOverdue } from "@/features/tasks/dates";
import { QuickAdd } from "@/features/home/QuickAdd";
import { TaskFormDialog } from "@/features/tasks/TaskFormDialog";
import { spacesForWorkspaceType, spacePath, SPACE_SLUGS } from "@/features/spaces/spaces";

interface UpcomingMeeting {
  id: string;
  title: string;
  start_at: string | null;
  end_at: string | null;
  due_date: string | null;
  workspace_id: string;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return "Buenas noches";
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

export function InicioView() {
  const navigate = useNavigate();
  const { currentWorkspace, profile, workspaces } = useWorkspace();
  const { tasks, isLoading } = useTasks(currentWorkspace?.id ?? null, {
    workspaceType: currentWorkspace?.type,
  });
  const timeFormat = useTimeFormat();

  const [inboxCount, setInboxCount] = useState<number | null>(null);
  const [meetings, setMeetings] = useState<UpcomingMeeting[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);

  const today = todayStr();

  const { todayCount, overdueCount } = useMemo(() => {
    const active = tasks.filter((t) => !t.completed);
    let todayTotal = 0;
    let overdueTotal = 0;
    active.forEach((t) => {
      if (t.kind === "meeting" || t.kind === "event") {
        if (
          t.dueDate === today ||
          t.startDate === today ||
          (t.startDate && t.endDate && t.startDate <= today && t.endDate >= today)
        ) {
          todayTotal += 1;
        }
        return;
      }
      if (isOverdue(t)) overdueTotal += 1;
      if (t.dueDate === today || (t.startDate && t.startDate <= today && t.endDate && t.endDate >= today)) {
        todayTotal += 1;
      }
    });
    return { todayCount: todayTotal, overdueCount: overdueTotal };
  }, [tasks, today]);

  const loadInboxCount = useCallback(async () => {
    const wsIds = workspaces.map((w) => w.id);
    if (wsIds.length === 0) {
      setInboxCount(0);
      return;
    }
    try {
      const { count } = await supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .in("workspace_id", wsIds)
        .eq("inboxed", true)
        .eq("is_active", true);
      setInboxCount(count ?? 0);
    } catch {
      setInboxCount(0);
    }
  }, [workspaces]);

  const loadMeetings = useCallback(async () => {
    if (!currentWorkspace?.id) return;
    const from = todayStr();
    const to = localDateStr(new Date(new Date().getTime() + 6 * 24 * 3600 * 1000));
    const kinds =
      currentWorkspace.type === "family"
        ? ["event"]
        : currentWorkspace.type === "personal"
          ? ["meeting", "event"]
          : ["meeting"];
    try {
      const { data } = await supabase
        .from("tasks")
        .select("id, title, start_at, end_at, due_date, workspace_id")
        .eq("workspace_id", currentWorkspace.id)
        .in("kind", kinds)
        .gte("due_date", from)
        .lte("due_date", to)
        .eq("is_active", true)
        .order("due_date", { ascending: true })
        .order("start_at", { ascending: true })
        .limit(5);
      setMeetings(data ?? []);
    } catch {
      setMeetings([]);
    }
  }, [currentWorkspace?.id, currentWorkspace?.type]);

  useEffect(() => {
    void loadInboxCount();
    void loadMeetings();
  }, [loadInboxCount, loadMeetings]);

  useEffect(() => {
    const onTasksChanged = () => {
      void loadInboxCount();
    };
    window.addEventListener("pritio:tasks-changed", onTasksChanged);
    return () => window.removeEventListener("pritio:tasks-changed", onTasksChanged);
  }, [loadInboxCount]);

  const goToSpace = useCallback(() => {
    if (!currentWorkspace) return;
    const first = spacesForWorkspaceType(currentWorkspace.type)[0]?.key ?? "pendientes";
    navigate(spacePath(first));
  }, [currentWorkspace, navigate]);

  const meetingDateLabel = (dueDate: string | null, startAt: string | null): string => {
    const parts: string[] = [];
    if (dueDate) {
      if (dueDate === today) parts.push("Hoy");
      else if (dueDate === localDateStr(new Date(new Date().getTime() + 1 * 24 * 3600 * 1000))) parts.push("Mañana");
      else
        parts.push(
          new Date(dueDate + "T12:00:00").toLocaleDateString("es-MX", {
            weekday: "short",
            day: "numeric",
            month: "short",
          }),
        );
    }
    if (startAt) parts.push(formatTime(new Date(startAt), timeFormat));
    return parts.join(" · ");
  };

  const firstName =
    profile?.fullName?.trim().split(/\s+/)[0] ?? profile?.email.split("@")[0] ?? "";

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 p-4 lg:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-ink">
          {firstName ? `${greeting()}, ${firstName}` : greeting()}
        </h1>
        <p className="text-sm text-ink-muted">
          Un vistazo a tu día y lo que tienes en espera.
        </p>
      </div>

      <div className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
        <QuickAdd variant="hero" onExpand={() => setDialogOpen(true)} />
      </div>

      {!isLoading && (
        <div className="mt-5 grid grid-cols-3 gap-2.5">
          <button
            type="button"
            onClick={() => navigate("/inbox")}
            className="group rounded-2xl border border-line bg-surface p-3.5 text-left shadow-soft transition-all hover:-translate-y-px hover:border-line-strong hover:shadow-elevated"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Inbox</span>
              <span className={cn("h-2 w-2 rounded-full", "bg-pritio-blue")} aria-hidden />
            </div>
            <p className="mt-1.5 text-2xl font-extrabold tabular-nums text-ink">
              {inboxCount ?? "—"}
            </p>
            <p className="text-[11px] font-medium text-ink-soft">Por decidir</p>
          </button>
          <button
            type="button"
            onClick={() => navigate("/mi-dia")}
            className="group rounded-2xl border border-line bg-surface p-3.5 text-left shadow-soft transition-all hover:-translate-y-px hover:border-line-strong hover:shadow-elevated"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Hoy</span>
              <span className={cn("h-2 w-2 rounded-full", "bg-pritio-green")} aria-hidden />
            </div>
            <p className="mt-1.5 text-2xl font-extrabold tabular-nums text-ink">{todayCount}</p>
            <p className="text-[11px] font-medium text-ink-soft">Para hoy</p>
          </button>
          <button
            type="button"
            onClick={() => navigate("/todas")}
            className="group rounded-2xl border border-line bg-surface p-3.5 text-left shadow-soft transition-all hover:-translate-y-px hover:border-line-strong hover:shadow-elevated"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Vencidas</span>
              <span className={cn("h-2 w-2 rounded-full", "bg-pritio-coral")} aria-hidden />
            </div>
            <p className={cn("mt-1.5 text-2xl font-extrabold tabular-nums", overdueCount > 0 ? "text-pritio-coral" : "text-ink")}>
              {overdueCount}
            </p>
            <p className="text-[11px] font-medium text-ink-soft">Atrasadas</p>
          </button>
        </div>
      )}

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-ink-muted">Próximas juntas</h2>
          <button
            type="button"
            onClick={() => navigate("/mi-dia")}
            className="text-xs font-semibold text-pritio-blue hover:underline"
          >
            Ver mi día
          </button>
        </div>
        {meetings.length === 0 ? (
          <div className="flex items-center gap-2.5 rounded-2xl border border-dashed border-line-strong bg-surface/60 px-4 py-4 text-sm text-ink-muted">
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="none" aria-hidden>
              <rect x="2.5" y="3" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M2.5 6.5H13.5" stroke="currentColor" strokeWidth="1.3" />
              <path d="M5.5 1.5V4M10.5 1.5V4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Sin juntas esta semana
          </div>
        ) : (
          <div className="space-y-1.5">
            {meetings.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  const ws = workspaces.find((w) => w.id === m.workspace_id);
                  if (ws) {
                    const space = spacesForWorkspaceType(ws.type)[0]?.key;
                    if (space) navigate(`/${SPACE_SLUGS[space]}/calendario`);
                  }
                }}
                className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-2.5 text-left shadow-soft transition-colors hover:border-line-strong hover:bg-surface-muted"
              >
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                    "bg-pritio-purple/10 text-pritio-purple",
                  )}
                >
                  <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <path d="M8 3.5V8L10.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{m.title}</p>
                  <p className="text-xs text-ink-muted">{meetingDateLabel(m.due_date, m.start_at)}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={goToSpace}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-semibold text-ink-soft shadow-soft transition-colors hover:border-line-strong hover:bg-surface-muted hover:text-ink"
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden>
          <rect x="2.5" y="2.5" width="11" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M2.5 6h11" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        Abrir cuadrantes de {currentWorkspace?.name ?? "mi espacio"}
      </button>

      <TaskFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={() => setDialogOpen(false)}
      />
    </div>
  );
}