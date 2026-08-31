import { useState, useEffect, useCallback } from "react";
import { cn, localDateStr, todayStr } from "@/lib/utils";
import { formatTime, useTimeFormat } from "@/lib/timeFormat";
import { supabase } from "@/lib/supabase";
import { WorkspaceSwitcher } from "@/components/layout/WorkspaceSwitcher";
import { DonationModal } from "@/components/layout/DonationModal";
import { PritioLogo } from "@/components/PritioLogo";
import { SidebarCalendar } from "@/components/layout/SidebarCalendar";
import { SidebarClock } from "@/components/layout/SidebarClock";
import { PomodoroWidget } from "@/components/layout/PomodoroWidget";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import { useBilling } from "@/features/billing/BillingProvider";
import { parsePlanLimitError } from "@/features/billing/guarded";
import { openUpgrade } from "@/features/billing/upgrade";
import { startProTrial } from "@/features/billing/api";
import { useTaskDates } from "@/features/calendar/useTaskDates";
import {
  blockedDaysEnabled,
  listBlockedDays,
  listWorkspaceBlockedDays,
  toggleBlockedDay,
} from "@/features/calendar/blockedDaysApi";
import { spacesForWorkspaceType } from "@/features/spaces/spaces";
import { IS_SELF_HOSTED, SHOW_DONATIONS } from "@/lib/constants";
import { APP_NAME } from "@/lib/branding";
import type { SpaceKey } from "@/features/spaces/spaces";
import type { WorkspaceType } from "@/types";
import { MeetingDetailModal } from "@/components/MeetingDetailModal";
import { TaskFormDialog } from "@/features/tasks/TaskFormDialog";
import { SidebarDayPopover } from "@/components/layout/SidebarDayPopover";
import { allowedKindsForWorkspace } from "@/features/tasks/kinds";
import { useWidgetPrefs } from "@/lib/widgetPrefs";
import { getTask } from "@/features/tasks/api";
import type { Task, BlockedDayStatus } from "@/types";
import { useToast } from "@/components/Toast";

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
  due_date: string | null;
  kind: string | null;
}

function upcomingMeetingsQuery(workspaceId: string, from: string, to: string, kinds: string[]) {
  return supabase
    .from("tasks")
    .select("id, title, start_at, end_at, meeting_link, location, description, due_date, kind")
    .eq("workspace_id", workspaceId)
    .in("kind", kinds)
    .gte("due_date", from)
    .lte("due_date", to)
    .eq("is_active", true)
    .order("due_date", { ascending: true })
    .order("start_at", { ascending: true })
    .limit(10);
}

export function Sidebar({
  activeSpace,
  onSpaceChange,
  isOpen,
  onClose,
  onNavigateToCalendar,
}: SidebarProps) {
  const { currentWorkspace, workspaces, createWorkspace, profile, members, isLeader } =
    useWorkspace();
  const { canCreate, canCreateWorkspace, refresh: refreshBilling } = useBilling();
  const { toast } = useToast();
  const timeFormat = useTimeFormat();
  const { clockVisible } = useWidgetPrefs();
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDonate, setShowDonate] = useState(false);
  const [newWsName, setNewWsName] = useState("");
  const [newWsType, setNewWsType] = useState<WorkspaceType>("team");
  const [creating, setCreating] = useState(false);
  const [calendarScope, setCalendarScope] = useState<"workspace" | "all">("workspace");
  const [dayPopover, setDayPopover] = useState<string | null>(null);
  const [popoverItems, setPopoverItems] = useState<
    { id: string; title: string; kind: "task" | "event" | "meeting"; startAt: string | null; completed: boolean; workspaceId: string }[]
  >([]);
  const [popoverBlocked, setPopoverBlocked] = useState(false);
  const [popoverBlockedBy, setPopoverBlockedBy] = useState<
    { name: string; userId: string; reason: string | null; status: BlockedDayStatus }[]
  >([]);
  const [popoverLoading, setPopoverLoading] = useState(false);

  const activeWorkspaceId = calendarScope === "all" ? null : (currentWorkspace?.id ?? null);

  const { taskDates } = useTaskDates(activeWorkspaceId, profile?.id ?? null);

  const blockedEnabled = blockedDaysEnabled(activeSpace, members.length);
  const [workspaceBlockedDates, setWorkspaceBlockedDates] = useState<string[]>([]);
  const [workspacePendingDates, setWorkspacePendingDates] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const now = new Date();
    const from = localDateStr(new Date(now.getFullYear(), now.getMonth() - 2, 1));
    const to = localDateStr(new Date(now.getFullYear(), now.getMonth() + 3, 0));

    if (calendarScope === "all") {
      if (!profile?.id) {
        setWorkspaceBlockedDates([]);
        setWorkspacePendingDates([]);
        return;
      }
      listBlockedDays(profile.id, null, from, to)
        .then((dates) => {
          if (!cancelled) setWorkspaceBlockedDates(dates);
        })
        .catch(() => {
          if (!cancelled) setWorkspaceBlockedDates([]);
        });
      return () => {
        cancelled = true;
      };
    }

    if (!blockedEnabled || !currentWorkspace?.id) {
      setWorkspaceBlockedDates([]);
      setWorkspacePendingDates([]);
      return;
    }
    listWorkspaceBlockedDays(currentWorkspace.id, from, to)
      .then((rows) => {
        if (cancelled) return;
        setWorkspaceBlockedDates(rows.filter((r) => r.status === "approved").map((r) => r.date));
        setWorkspacePendingDates(rows.filter((r) => r.status === "pending").map((r) => r.date));
      })
      .catch(() => {
        if (!cancelled) {
          setWorkspaceBlockedDates([]);
          setWorkspacePendingDates([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [blockedEnabled, calendarScope, currentWorkspace?.id, profile?.id]);

  const wsColorMap: Record<string, string> = {
    personal: "#9B7EDC",
    family: "#4FC38A",
    team: "#5BA7D1",
  };
  const [upcomingMeetings, setUpcomingMeetings] = useState<TodayMeeting[]>([]);
  const [selectedMeeting, setSelectedMeeting] = useState<TodayMeeting | null>(null);
  const [editingMeeting, setEditingMeeting] = useState<Task | null>(null);
  const [showMeetingForm, setShowMeetingForm] = useState(false);
  const [showAllMeetings, setShowAllMeetings] = useState(false);

  const loadUpcomingMeetings = useCallback(() => {
    if (!currentWorkspace?.id) return;
    const from = todayStr();
    const to = localDateStr(new Date(new Date().getTime() + 6 * 24 * 3600 * 1000));
    const kinds =
      currentWorkspace.type === "family"
        ? ["event"]
        : currentWorkspace.type === "personal"
          ? ["meeting", "event"]
          : ["meeting"];
    upcomingMeetingsQuery(currentWorkspace.id, from, to, kinds).then(({ data }) => {
      setUpcomingMeetings(data ?? []);
      setShowAllMeetings(false);
    });
  }, [currentWorkspace?.id, currentWorkspace?.type]);

  useEffect(() => {
    loadUpcomingMeetings();
  }, [loadUpcomingMeetings]);

  const handleEditMeeting = useCallback(async (meeting: { id: string }) => {
    try {
      const fullTask = await getTask(meeting.id);
      setEditingMeeting(fullTask);
      setSelectedMeeting(null);
    } catch {
      setSelectedMeeting(null);
    }
  }, []);

  const spaces = currentWorkspace
    ? spacesForWorkspaceType(currentWorkspace.type)
    : [];

  const handleDayClick = useCallback(
    async (dateStr: string) => {
      setDayPopover(dateStr);
      setPopoverLoading(true);
      setPopoverBlocked(false);
      setPopoverBlockedBy([]);
      try {
        const wsIds =
          calendarScope === "all" && profile?.id
            ? (await supabase.from("workspace_members").select("workspace_id").eq("user_id", profile.id))
                .data?.map((m) => m.workspace_id) ?? []
            : currentWorkspace?.id
              ? [currentWorkspace.id]
              : [];

        if (wsIds.length === 0) {
          setPopoverItems([]);
        } else {
          let query = supabase
            .from("tasks")
            .select("id, title, kind, start_at, completed, workspace_id")
            .eq("is_active", true)
            .eq("due_date", dateStr)
            .in("workspace_id", wsIds);
          if (calendarScope === "workspace") {
            query = query.in("kind", allowedKindsForWorkspace(currentWorkspace?.type));
          }
          const { data } = await query.order("start_at", { ascending: true }).limit(50);
          setPopoverItems(
            (data ?? []).map((row) => ({
              id: row.id,
              title: row.title,
              kind: (row.kind as "task" | "event" | "meeting") ?? "task",
              startAt: row.start_at,
              completed: row.completed,
              workspaceId: row.workspace_id,
            })),
          );
        }

        /* Check blocked + who/motivo */
        if (profile?.id && currentWorkspace?.id && blockedEnabled) {
          const rows = await listWorkspaceBlockedDays(
            currentWorkspace.id,
            dateStr,
            dateStr,
          );
          setPopoverBlockedBy(rows);
          setPopoverBlocked(rows.some((r) => r.userId === profile.id && r.status === "approved"));
        }
      } catch {
        setPopoverItems([]);
      } finally {
        setPopoverLoading(false);
      }
    },
    [profile?.id, currentWorkspace?.id, blockedEnabled, calendarScope],
  );

  const handleToggleBlocked = useCallback(
    async (reason?: string) => {
      if (!profile?.id || !currentWorkspace?.id || !dayPopover || !blockedEnabled)
        return;
      const alreadyBlocked = popoverBlockedBy.some((r) => r.userId === profile.id);
      if (!alreadyBlocked && !canCreate("blocked_days")) return;
      try {
        const result = await toggleBlockedDay(
          profile.id,
          currentWorkspace.id,
          dayPopover,
          reason,
          isLeader,
        );
        const { blocked, pending } = result;
        setPopoverBlocked(blocked && !pending);
        setPopoverBlockedBy((prev) => {
          const others = prev.filter((r) => r.userId !== profile.id);
          if (blocked) {
            return [
              {
                name: "Tú",
                userId: profile.id,
                reason: reason?.trim() || null,
                status: pending ? "pending" : "approved",
              },
              ...others,
            ];
          }
          return others;
        });
        setWorkspaceBlockedDates((prev) => {
          const set = new Set(prev);
          if (blocked && !pending) set.add(dayPopover);
          else set.delete(dayPopover);
          return Array.from(set);
        });
        setWorkspacePendingDates((prev) => {
          const set = new Set(prev);
          if (blocked && pending) set.add(dayPopover);
          else set.delete(dayPopover);
          return Array.from(set);
        });
        if (blocked && pending) {
          toast.info("Solicitud enviada — espera la aprobación del equipo");
        } else if (blocked) {
          toast.success("Día bloqueado");
        } else {
          toast.success("Solicitud cancelada");
        }
      } catch (err) {
        const resource = parsePlanLimitError(err);
        if (resource) {
          openUpgrade(resource);
          return;
        }
        toast.error("No se pudo actualizar el día");
      }
    },
    [profile?.id, currentWorkspace?.id, dayPopover, blockedEnabled, isLeader, toast, canCreate, popoverBlockedBy],
  );

  const handleCreateWorkspace = useCallback(
    async (withTrial: boolean) => {
      if (!newWsName.trim()) return;
      if (!canCreateWorkspace(newWsType)) return;
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
        if (withTrial && (newWsType === "family" || newWsType === "team")) {
          await startProTrial(ws.id);
          toast.success("¡Prueba Pro de 14 días activada!");
          void refreshBilling();
        }
        setShowCreateDialog(false);
        setNewWsName("");
      } catch (err) {
        const resource = parsePlanLimitError(err);
        if (resource) {
          openUpgrade(resource);
          return;
        }
        toast.error("No se pudo crear el workspace");
      } finally {
        setCreating(false);
      }
    },
    [newWsName, newWsType, profile, canCreateWorkspace, createWorkspace, refreshBilling, toast],
  );

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
          "fixed inset-y-0 left-0 z-50 flex w-[85vw] max-w-72 flex-col bg-surface border-r border-line transition-transform duration-200 lg:static lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex flex-col h-full overflow-y-auto p-4 space-y-6">
          {/* Header: marca + Beta discreto */}
          <div className="flex items-center gap-2.5">
            <PritioLogo size={28} withGlow={false} />
            <span className="text-base font-extrabold tracking-tight text-ink">
              {APP_NAME}
            </span>
            <span className="ml-auto rounded-full border border-line bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
              Beta
            </span>
          </div>

          {/* Espacio activo */}
          <div className="relative">
            <p className="text-xs text-ink-muted uppercase tracking-wide mb-2">
              Espacio activo
            </p>
            <button
              type="button"
              onClick={() => setShowWorkspaceMenu((v) => !v)}
              aria-haspopup="true"
              aria-expanded={showWorkspaceMenu}
              className="flex w-full items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2.5 text-left transition-colors hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pritio-purple/40"
            >
              <div
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: wsColorMap[currentWorkspace?.type ?? "personal"] ?? "#9B7EDC" }}
                aria-hidden
              />
              <span className="truncate text-sm font-semibold text-ink">
                {currentWorkspace?.name ?? "Cargando..."}
              </span>
              <svg
                className={cn(
                  "ml-auto h-4 w-4 text-ink-muted transition-transform duration-200",
                  showWorkspaceMenu && "rotate-180",
                )}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            <WorkspaceSwitcher
              open={showWorkspaceMenu}
              onClose={() => setShowWorkspaceMenu(false)}
              onCreateWorkspace={(type) => {
                setShowWorkspaceMenu(false);
                setShowCreateDialog(true);
                setNewWsType(type);
              }}
            />

            <nav className="mt-1.5 flex flex-col gap-0.5" aria-label="Espacios del workspace">
              {spaces.map((space) => (
                <button
                  key={space.key}
                  onClick={() => {
                    onSpaceChange(space.key);
                    onClose();
                  }}
                  className={cn(
                    "flex w-full min-h-[40px] items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pritio-purple/40",
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

          {/* Próximas juntas */}
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs text-ink-muted uppercase tracking-wide">
                Próximas juntas
              </p>
              <button
                type="button"
                onClick={() => setShowMeetingForm(true)}
                className="text-xs font-semibold text-pritio-purple hover:text-pritio-purple/80 transition-colors"
              >
                + Programar junta
              </button>
            </div>
            {upcomingMeetings.length === 0 ? (
              <div className="flex min-h-[44px] items-center gap-2.5 rounded-xl border border-line px-3 py-2 text-sm text-ink-muted">
                <svg className="h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <rect x="2.5" y="3" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M2.5 6.5H13.5" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M5.5 1.5V4M10.5 1.5V4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                Sin juntas esta semana
              </div>
            ) : (
              <div className="space-y-1.5">
                {(showAllMeetings ? upcomingMeetings : upcomingMeetings.slice(0, 2)).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSelectedMeeting(m)}
                    className="flex w-full min-h-[44px] items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2 text-left transition-colors hover:border-line-strong hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pritio-purple/40"
                  >
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                        m.kind === "event"
                          ? "bg-pritio-coral/10 text-pritio-coral"
                          : "bg-pritio-purple/10 text-pritio-purple",
                      )}
                    >
                      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden>
                        <path d="M8 3.5V8L10.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{m.title}</p>
                      <p className="text-xs text-ink-muted">
                        {m.due_date
                          ? m.due_date === todayStr()
                            ? "Hoy"
                            : new Date(m.due_date + "T12:00:00").toLocaleDateString(
                                "es-MX",
                                { weekday: "short", day: "numeric", month: "short" },
                              )
                          : ""}
                        {m.start_at
                          ? ` · ${formatTime(new Date(m.start_at), timeFormat)}`
                          : ""}
                        {m.end_at ? ` - ${formatTime(new Date(m.end_at), timeFormat)}` : ""}
                      </p>
                    </div>
                  </button>
                ))}
                {upcomingMeetings.length > 2 && (
                  <button
                    type="button"
                    onClick={() => setShowAllMeetings((v) => !v)}
                    className="w-full rounded-lg py-1.5 text-center text-xs font-semibold text-pritio-purple hover:bg-surface-muted transition-colors"
                  >
                    {showAllMeetings
                      ? "Ver menos"
                      : `Ver todas (${upcomingMeetings.length})`}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Calendario */}
          <SidebarCalendar
            scope={calendarScope}
            onScopeChange={setCalendarScope}
            workspaceId={currentWorkspace?.id ?? null}
            userId={profile?.id ?? null}
            taskDates={taskDates}
            blockedDates={workspaceBlockedDates}
            pendingDates={workspacePendingDates}
            onDayClick={handleDayClick}
          />

          {/* Spacer */}
          <div className="flex-1" />

          {/* Espacio reservado para widgets futuros */}
          <div className="flex-1" />
          <div className="space-y-4">
            {clockVisible && <SidebarClock />}
            <PomodoroWidget />
            {SHOW_DONATIONS && !IS_SELF_HOSTED && (
              <button
                type="button"
                onClick={() => setShowDonate(true)}
                className="text-xs text-pritio-purple hover:text-pritio-purple/80 transition-colors"
              >
                Donar ❤️
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Day popover */}
      {dayPopover && (
        <SidebarDayPopover
          key={dayPopover}
          dateStr={dayPopover}
          items={popoverItems}
          isBlocked={popoverBlocked}
          blockedBy={popoverBlockedBy}
          loading={popoverLoading}
          scope={calendarScope}
          workspaces={workspaces}
          myUserId={profile?.id ?? ""}
          blockedEnabled={blockedEnabled}
          needsApproval={!isLeader}
          onToggleBlocked={handleToggleBlocked}
          onNavigateToCalendar={() => {
            onNavigateToCalendar?.(dayPopover);
            setDayPopover(null);
          }}
          onClose={() => setDayPopover(null)}
        />
      )}

      <DonationModal open={showDonate} onClose={() => setShowDonate(false)} />
      {selectedMeeting && (
        <MeetingDetailModal
          meeting={selectedMeeting}
          onClose={() => setSelectedMeeting(null)}
          onEdit={(m) => void handleEditMeeting(m)}
          onDeleted={() => {
            setSelectedMeeting(null);
            loadUpcomingMeetings();
          }}
        />
      )}
      <TaskFormDialog
        open={!!editingMeeting || showMeetingForm}
        task={showMeetingForm ? null : editingMeeting}
        onClose={() => {
          setEditingMeeting(null);
          setShowMeetingForm(false);
        }}
        onSaved={() => {
          setEditingMeeting(null);
          setShowMeetingForm(false);
          loadUpcomingMeetings();
        }}
        defaultKind={showMeetingForm ? "meeting" : undefined}
      />

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
              className="w-full rounded-xl border border-line px-3.5 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-pritio-blue focus:ring-1 focus:ring-pritio-blue/20 mb-4"
            />

            <label className="block text-sm font-medium text-ink mb-1.5">Tipo</label>
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setNewWsType("team")}
                className={cn(
                  "flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition-all",
                  newWsType === "team"
                    ? "border-pritio-blue bg-pritio-blue/10 text-pritio-blue shadow-sm"
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
                    ? "border-pritio-blue bg-pritio-blue/10 text-pritio-blue shadow-sm"
                    : "border-line text-ink-muted hover:bg-surface-muted",
                )}
              >
                Familia
              </button>
            </div>

            <div className="flex flex-col gap-2">
              {(newWsType === "family" || newWsType === "team") && (
                <button
                  disabled={!newWsName.trim() || creating}
                  onClick={() => void handleCreateWorkspace(true)}
                  className="w-full rounded-xl bg-gradient-to-r from-pritio-purple to-pritio-blue px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creating ? "Creando..." : "Probar Pro gratis 14 días"}
                </button>
              )}
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
                  onClick={() => void handleCreateWorkspace(false)}
                  className="rounded-xl bg-pritio-blue px-4 py-2 text-sm font-medium text-white transition-all hover:bg-pritio-blue/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creating ? "Creando..." : "Comenzar gratis"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}


