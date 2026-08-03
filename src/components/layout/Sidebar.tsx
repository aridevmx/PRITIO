import { useState, useEffect, useCallback } from "react";
import { cn, localDateStr, todayStr } from "@/lib/utils";
import { formatTime, useTimeFormat } from "@/lib/timeFormat";
import { supabase } from "@/lib/supabase";
import { MiniCalendar } from "@/components/layout/MiniCalendar";
import { WorkspaceSwitcher } from "@/components/layout/WorkspaceSwitcher";
import { DonationModal } from "@/components/layout/DonationModal";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import { useTaskDates } from "@/features/calendar/useTaskDates";
import {
  blockedDaysEnabled,
  listWorkspaceBlockedDays,
  toggleBlockedDay,
} from "@/features/calendar/blockedDaysApi";
import { spacesForWorkspaceType } from "@/features/spaces/spaces";
import { IS_SELF_HOSTED } from "@/lib/constants";
import { APP_NAME } from "@/lib/branding";
import type { SpaceKey } from "@/features/spaces/spaces";
import type { WorkspaceType } from "@/types";
import { createPortal } from "react-dom";
import { MeetingDetailModal } from "@/components/MeetingDetailModal";

interface SidebarProps {
  activeSpace: SpaceKey;
  onSpaceChange: (space: SpaceKey) => void;
  isOpen: boolean;
  onClose: () => void;
  onNavigateToCalendar?: (dateStr: string) => void;
}

interface TodayMeeting {
  id: string;
  title: string;
  start_at: string | null;
  end_at: string | null;
  meeting_link: string | null;
  location: string | null;
  description: string | null;
}

function todayMeetingsQuery(workspaceId: string) {
  const today = todayStr();
  return supabase
    .from("tasks")
    .select("id, title, start_at, end_at, meeting_link, location, description")
    .eq("workspace_id", workspaceId)
    .eq("kind", "meeting")
    .eq("due_date", today)
    .eq("is_active", true)
    .order("start_at", { ascending: true })
    .limit(5);
}

export function Sidebar({
  activeSpace,
  onSpaceChange,
  isOpen,
  onClose,
  onNavigateToCalendar,
}: SidebarProps) {
  const { currentWorkspace, createWorkspace, profile, members } =
    useWorkspace();
  const timeFormat = useTimeFormat();
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDonate, setShowDonate] = useState(false);
  const [newWsName, setNewWsName] = useState("");
  const [newWsType, setNewWsType] = useState<WorkspaceType>("team");
  const [creating, setCreating] = useState(false);
  const [showAllDates, setShowAllDates] = useState(false);
  const [dayPopover, setDayPopover] = useState<string | null>(null);
  const [popoverTasks, setPopoverTasks] = useState<
    { id: string; title: string; kind: string; start_at: string | null; completed: boolean; quadrant: string }[]
  >([]);
  const [popoverBlocked, setPopoverBlocked] = useState(false);
  const [popoverLoading, setPopoverLoading] = useState(false);

  const activeWorkspaceId = showAllDates ? null : (currentWorkspace?.id ?? null);

  const { taskDates } = useTaskDates(activeWorkspaceId, profile?.id ?? null);

  const blockedEnabled = blockedDaysEnabled(activeSpace, members.length);
  const [workspaceBlockedDates, setWorkspaceBlockedDates] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!blockedEnabled || showAllDates || !currentWorkspace?.id) {
      setWorkspaceBlockedDates([]);
      return;
    }
    const now = new Date();
    const from = localDateStr(new Date(now.getFullYear(), now.getMonth() - 2, 1));
    const to = localDateStr(new Date(now.getFullYear(), now.getMonth() + 3, 0));
    listWorkspaceBlockedDays(currentWorkspace.id, from, to)
      .then((rows) => {
        if (!cancelled) setWorkspaceBlockedDates(rows.map((r) => r.date));
      })
      .catch(() => {
        if (!cancelled) setWorkspaceBlockedDates([]);
      });
    return () => {
      cancelled = true;
    };
  }, [blockedEnabled, showAllDates, currentWorkspace?.id]);

  const wsColorMap: Record<string, string> = {
    personal: "#9B7EDC",
    family: "#4FC38A",
    team: "#5BA7D1",
    enterprise: "#F27D72",
  };
  const [todayMeetings, setTodayMeetings] = useState<TodayMeeting[]>([]);
  const [selectedMeeting, setSelectedMeeting] = useState<TodayMeeting | null>(null);

  useEffect(() => {
    if (!currentWorkspace?.id) return;
    todayMeetingsQuery(currentWorkspace.id).then(({ data }) => {
      setTodayMeetings(data ?? []);
    });
  }, [currentWorkspace?.id]);

  const spaces = currentWorkspace
    ? spacesForWorkspaceType(currentWorkspace.type)
    : [];

  const handleDayClick = useCallback(async (dateStr: string) => {
    setDayPopover(dateStr);
    setPopoverLoading(true);
    try {
      const { data } = await supabase
        .from("tasks")
        .select("id, title, kind, start_at, completed, quadrant")
        .eq("is_active", true)
        .eq("due_date", dateStr)
        .order("created_at", { ascending: false })
        .limit(10);
      setPopoverTasks(data ?? []);

      /* Check blocked */
      if (profile?.id && currentWorkspace?.id && blockedEnabled) {
        const { data: bd } = await supabase
          .from("user_blocked_days")
          .select("id")
          .eq("user_id", profile.id)
          .eq("workspace_id", currentWorkspace.id)
          .eq("blocked_date", dateStr)
          .maybeSingle();
        setPopoverBlocked(!!bd);
      }
    } catch {
      // ignore
    } finally {
      setPopoverLoading(false);
    }
  }, [profile?.id, currentWorkspace?.id, blockedEnabled]);

  const handleToggleBlocked = useCallback(async () => {
    if (!profile?.id || !currentWorkspace?.id || !dayPopover || !blockedEnabled) return;
    try {
      const isNowBlocked = await toggleBlockedDay(profile.id, currentWorkspace.id, dayPopover);
      setPopoverBlocked(isNowBlocked);
      setWorkspaceBlockedDates((prev) => {
        const set = new Set(prev);
        if (isNowBlocked) set.add(dayPopover);
        else set.delete(dayPopover);
        return Array.from(set);
      });
    } catch {
      // ignore
    }
  }, [profile?.id, currentWorkspace?.id, dayPopover, blockedEnabled]);

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-surface border-r border-line transition-transform duration-200 lg:static lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex flex-col h-full overflow-y-auto p-4 space-y-6">
          {/* Header: app icon + APP_NAME + BETA */}
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-purple-400 to-violet-600 text-white">
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <span className="text-base font-extrabold tracking-tight text-ink">
              {APP_NAME}
            </span>
            <span className="ml-auto rounded-full bg-prio-purple/10 px-2 py-0.5 text-xs font-semibold text-prio-purple">
              BETA
            </span>
          </div>

          {/* Workspace activo */}
          <div className="relative">
            <p className="text-xs text-ink-muted uppercase tracking-wide mb-2">
              Espacio de trabajo
            </p>
            <div className="flex items-center gap-2">
              <div
                className="flex flex-1 items-center gap-2 rounded-xl border border-line px-3 py-2.5 cursor-pointer"
                onClick={() => setShowWorkspaceMenu(!showWorkspaceMenu)}
              >
                <div
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: wsColorMap[currentWorkspace?.type ?? "personal"] ?? "#9B7EDC" }}
                />
                <span className="truncate text-sm font-semibold text-ink">
                  {currentWorkspace?.name ?? "Cargando..."}
                </span>
                <svg className="ml-auto h-4 w-4 text-ink-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            <WorkspaceSwitcher
              open={showWorkspaceMenu}
              onClose={() => setShowWorkspaceMenu(false)}
              onCreateWorkspace={(type) => {
                setShowWorkspaceMenu(false);
                setShowCreateDialog(true);
                setNewWsType(type);
              }}
            />
          </div>

          {/* Space navigation */}
          <div>
            <p className="text-xs text-ink-muted uppercase tracking-wide mb-2">
              {currentWorkspace ? (currentWorkspace.type === "personal" ? "Mis espacios" : "Espacios") : "Espacios"}
            </p>
            <nav className="flex flex-col gap-0.5">
              {spaces.map((space) => (
                <button
                  key={space.key}
                  onClick={() => {
                    onSpaceChange(space.key);
                    onClose();
                  }}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors",
                    activeSpace === space.key
                      ? "bg-surface-muted text-ink"
                      : "text-ink-muted hover:bg-surface-muted hover:text-ink-soft",
                  )}
                >
                  <div className={cn("h-2 w-2 rounded-full shrink-0", space.accent.bg)} />
                  <span>{space.label}</span>
                </button>
              ))}
            </nav>
          </div>

          {/* Juntas de hoy */}
          <div>
            <p className="text-xs text-ink-muted uppercase tracking-wide mb-2">
              Juntas de hoy
            </p>
            {todayMeetings.length === 0 ? (
              <div className="rounded-2xl bg-surface shadow-sm border border-line p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-muted text-ink-muted shrink-0">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-sm text-ink-muted">Sin juntas hoy</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {todayMeetings.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setSelectedMeeting(m)}
                    className="w-full rounded-2xl bg-surface shadow-sm border border-line p-4 text-left hover:shadow-soft hover:border-ink-muted/30 transition-all"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-prio-purple/10 text-prio-purple shrink-0 mt-0.5">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-ink truncate">{m.title}</p>
                        {m.start_at && (
                          <p className="text-xs text-ink-muted mt-0.5">
                            {formatTime(new Date(m.start_at), timeFormat)}
                            {m.end_at ? ` - ${formatTime(new Date(m.end_at), timeFormat)}` : ""}
                          </p>
                        )}
                        {m.description && (
                          <p className="text-xs text-ink-soft mt-1 line-clamp-1">{m.description}</p>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Mini calendar */}
          <div>
            <p className="text-xs text-ink-muted uppercase tracking-wide mb-2">
              Calendario
            </p>
            <div className="flex items-center gap-1 rounded-full bg-surface-muted p-1 mb-3">
              <button
                onClick={() => setShowAllDates(false)}
                className={cn(
                  "flex-1 rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                  !showAllDates ? "bg-ink text-white" : "text-ink-muted",
                )}
              >
                Este espacio
              </button>
              <button
                onClick={() => setShowAllDates(true)}
                className={cn(
                  "flex-1 rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                  showAllDates ? "bg-ink text-white" : "text-ink-muted",
                )}
              >
                Todos
              </button>
            </div>
            <div className="rounded-2xl bg-surface shadow-sm border border-line p-4">
              <MiniCalendar
                taskDates={taskDates}
                blockedDates={workspaceBlockedDates}
                onDayClick={handleDayClick}
              />
            </div>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Footer */}
          <div className="border-t border-line pt-3">
            <p className="text-xs text-ink-muted">
              &copy; 2026 {APP_NAME}. Todos los derechos reservados.
            </p>
            {!IS_SELF_HOSTED && (
              <button
                onClick={() => setShowDonate(true)}
                className="mt-2 text-xs text-prio-purple hover:text-prio-purple/80 transition-colors"
              >
                Donar ❤️
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Day popover */}
      {dayPopover && (
        <DayPopover
          dateStr={dayPopover}
          tasks={popoverTasks}
          isBlocked={popoverBlocked}
          loading={popoverLoading}
          blockedEnabled={blockedEnabled}
          onToggleBlocked={handleToggleBlocked}
          onNavigateToCalendar={() => {
            onNavigateToCalendar?.(dayPopover);
            setDayPopover(null);
          }}
          onClose={() => setDayPopover(null)}
        />
      )}

      <DonationModal open={showDonate} onClose={() => setShowDonate(false)} />
      {selectedMeeting && <MeetingDetailModal meeting={selectedMeeting} onClose={() => setSelectedMeeting(null)} />}

      {/* Create workspace dialog — full screen */}
      {showCreateDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/30 backdrop-blur-sm">
          <div className="w-full max-w-md mx-4 rounded-2xl border border-line bg-surface p-6 shadow-elevated">
            <h2 className="text-lg font-bold text-ink mb-4">Nuevo espacio de trabajo</h2>

            <label className="block text-sm font-medium text-ink mb-1.5">Nombre</label>
            <input
              autoFocus
              value={newWsName}
              onChange={(e) => setNewWsName(e.target.value)}
              placeholder="Ej: Trabajo, Familia..."
              className="w-full rounded-xl border border-line px-3.5 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-prio-blue focus:ring-1 focus:ring-prio-blue/20 mb-4"
            />

            <label className="block text-sm font-medium text-ink mb-1.5">Tipo</label>
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setNewWsType("team")}
                className={cn(
                  "flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition-all",
                  newWsType === "team"
                    ? "border-prio-blue bg-prio-blue/10 text-prio-blue shadow-sm"
                    : "border-line text-ink-muted hover:bg-surface-muted",
                )}
              >
                Trabajo
              </button>
              <button
                onClick={() => setNewWsType("family")}
                className={cn(
                  "flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition-all",
                  newWsType === "family"
                    ? "border-prio-blue bg-prio-blue/10 text-prio-blue shadow-sm"
                    : "border-line text-ink-muted hover:bg-surface-muted",
                )}
              >
                Familia
              </button>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowCreateDialog(false);
                  setNewWsName("");
                }}
                className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-muted"
              >
                Cancelar
              </button>
              <button
                disabled={!newWsName.trim() || creating}
                onClick={async () => {
                  setCreating(true);
                  try {
                    const ws = await createWorkspace(newWsName.trim(), newWsType);
                    /* Auto-create assignee for the workspace owner */
                    if (newWsType !== "personal" && profile) {
                      const { error: ae } = await supabase
                        .from("assignees")
                        .insert({
                          workspace_id: ws.id,
                          name: profile.fullName || profile.email.split("@")[0],
                          color: "#5BA7D1",
                          linked_user_id: profile.id,
                        });
                      if (ae) console.error("Failed to create owner assignee:", ae);
                    }
                    setShowCreateDialog(false);
                    setNewWsName("");
                  } catch {
                    // error logged by createWorkspace
                  } finally {
                    setCreating(false);
                  }
                }}
                className="rounded-xl bg-prio-blue px-4 py-2 text-sm font-medium text-white transition-all hover:bg-prio-blue/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? "Creando..." : "Crear"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ─── Day Popover ─────────────────────────── */

interface DayPopoverProps {
  dateStr: string;
  tasks: { id: string; title: string; kind: string; start_at: string | null; completed: boolean; quadrant: string }[];
  isBlocked: boolean;
  loading: boolean;
  blockedEnabled: boolean;
  onToggleBlocked: () => void;
  onNavigateToCalendar: () => void;
  onClose: () => void;
}

function DayPopover({
  dateStr,
  tasks,
  isBlocked,
  loading,
  blockedEnabled,
  onToggleBlocked,
  onNavigateToCalendar,
  onClose,
}: DayPopoverProps) {
  const timeFormat = useTimeFormat();
  const formatted = new Date(dateStr + "T12:00:00").toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-ink/20 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="prio-modal-enter mx-4 w-full max-w-xs rounded-2xl bg-surface p-5 shadow-elevated border border-line">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-bold text-ink capitalize">{formatted}</h4>
          <button
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink transition-colors"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {loading ? (
          <p className="text-xs text-ink-soft py-3 text-center">Cargando...</p>
        ) : (
          <div className="space-y-2">
            {tasks.length === 0 && !isBlocked && (
              <p className="text-xs text-ink-muted py-3 text-center">Sin actividades este día</p>
            )}

            {tasks.map((t) => (
              <div
                key={t.id}
                className={cn(
                  "rounded-lg border border-line px-3 py-2 text-left",
                  t.completed && "opacity-60",
                )}
              >
                <div className="flex items-center gap-1.5">
                  {t.kind === "meeting" && (
                    <svg className="h-3 w-3 shrink-0 text-prio-purple" viewBox="0 0 12 12" fill="none">
                      <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M6 3.5V6.5L8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  )}
                  <span className={cn("text-xs font-medium text-ink", t.completed && "line-through text-ink-muted")}>
                    {t.title}
                  </span>
                </div>
                {t.start_at && (
                  <p className="text-[10px] text-ink-muted mt-0.5">
                    {formatTime(new Date(t.start_at), timeFormat)}
                  </p>
                )}
              </div>
            ))}

            {/* Blocked toggle */}
            {blockedEnabled && (
              <button
                type="button"
                onClick={onToggleBlocked}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                  isBlocked
                    ? "border-rose-200 bg-rose-50 text-rose-700"
                    : "border-line text-ink-muted hover:bg-surface-muted",
                )}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 12 12" fill="none">
                  <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M3.5 3.5L8.5 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                {isBlocked ? "Quitar bloqueo" : "Bloquear día"}
              </button>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={onNavigateToCalendar}
          className="mt-3 w-full rounded-lg bg-prio-blue py-2 text-xs font-semibold text-white hover:bg-prio-blue/90 transition-colors"
        >
          Ver en calendario
        </button>
      </div>
    </div>,
    document.body,
  );
}
