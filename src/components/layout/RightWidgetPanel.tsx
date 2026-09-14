import { useCallback, useEffect, useState } from "react";
import { cn, localDateStr } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import { useBilling } from "@/features/billing/BillingProvider";
import { useToast } from "@/components/Toast";
import { parsePlanLimitError } from "@/features/billing/guarded";
import { openUpgrade } from "@/features/billing/upgrade";
import { useTaskDates } from "@/features/calendar/useTaskDates";
import {
  blockedDaysEnabled,
  listBlockedDays,
  listWorkspaceBlockedDays,
  toggleBlockedDay,
} from "@/features/calendar/blockedDaysApi";
import { SidebarCalendar } from "@/components/layout/SidebarCalendar";
import { SidebarClock } from "@/components/layout/SidebarClock";
import { PomodoroWidget } from "@/components/layout/PomodoroWidget";
import { SidebarDayPopover } from "@/components/layout/SidebarDayPopover";
import { DonationModal } from "@/components/layout/DonationModal";
import { useWidgetPrefs } from "@/lib/widgetPrefs";
import { allowedKindsForWorkspace } from "@/features/tasks/kinds";
import { IS_SELF_HOSTED, SHOW_DONATIONS } from "@/lib/constants";
import type { SpaceKey } from "@/features/spaces/spaces";
import type { BlockedDayStatus } from "@/types";

interface RightWidgetPanelProps {
  open: boolean;
  onClose: () => void;
  space: SpaceKey | null;
  onNavigateToCalendar?: (dateStr: string) => void;
}

export function RightWidgetPanel({ open, onClose, space, onNavigateToCalendar }: RightWidgetPanelProps) {
  const { currentWorkspace, workspaces, profile, members, isLeader } = useWorkspace();
  const { canCreate } = useBilling();
  const { toast } = useToast();
  const { clockVisible } = useWidgetPrefs();

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
  const [workspaceBlockedDates, setWorkspaceBlockedDates] = useState<string[]>([]);
  const [workspacePendingDates, setWorkspacePendingDates] = useState<string[]>([]);
  const [showDonate, setShowDonate] = useState(false);

  const activeWorkspaceId = calendarScope === "all" ? null : (currentWorkspace?.id ?? null);
  const { taskDates } = useTaskDates(activeWorkspaceId, profile?.id ?? null);

  const blockedEnabled = blockedDaysEnabled(space ?? "pendientes", members.length);

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
    [profile?.id, currentWorkspace?.id, currentWorkspace?.type, blockedEnabled, calendarScope],
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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDayPopover(null);
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-sm"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        aria-hidden={!open}
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-[85vw] max-w-80 flex-col bg-surface border-l border-line shadow-elevated transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
          <p className="text-sm font-bold tracking-tight text-ink">Calendario y utilidades</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar panel"
            className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-surface-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pritio-blue/40"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-4 pb-[env(safe-area-inset-bottom)]">
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

          <div className="h-px bg-line" />

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
    </>
  );
}