import { useEffect, useRef, useState } from "react";
import { appEvents } from "@/lib/appEvents";
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  Inbox,
  Mail,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import {
  useNotifications,
  type OverdueItem,
} from "@/features/notifications/useNotifications";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import { useTaskNavigation } from "@/features/tasks/TaskNavigationProvider";
import { formatRelativeFromTimestamp } from "@/features/tasks/dates";
import type { Notification, NotificationKind } from "@/types";
import { cn } from "@/lib/utils";

export function NotificationBell() {
  const {
    notifications,
    overdue,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
  } = useNotifications();
  const { setActiveWorkspaceId } = useWorkspace();
  const {
    navigateToTask,
    navigateToProject,
    navigateToWorkspace,
    navigateToMember,
  } = useTaskNavigation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function handleClickNotification(n: Notification) {
    void markAsRead(n.id);
    setOpen(false);
    // Resolver destino:
    //   - kind 'role_changed' → navigateToMember (abre Miembros)
    //   - taskId presente     → navigateToTask
    //   - projectId presente  → navigateToProject (highlight chip)
    //   - workspaceId only    → navigateToWorkspace
    if (n.kind === "role_changed" && n.workspaceId) {
      // El user_id de la notification ES el miembro a resaltar
      void navigateToMember({
        memberId: n.userId,
        workspaceId: n.workspaceId,
      });
      return;
    }
    // Notif "alguien pidio bloquear un dia" → cambiar al workspace
    // del evento y abrir el panel de aprobaciones (mig 0062).
    if (n.kind === "blocked_day_pending_approval" && n.workspaceId) {
      setActiveWorkspaceId(n.workspaceId);
      appEvents.emit("blockedDays:openApprovals", {
        workspaceId: n.workspaceId,
      });
      return;
    }
    // Tu bloqueo fue aprobado/rechazado → abrir tu listado para que
    // veas el badge actualizado o el motivo del rechazo.
    if (
      (n.kind === "blocked_day_approved" ||
        n.kind === "blocked_day_rejected") &&
      n.workspaceId
    ) {
      setActiveWorkspaceId(n.workspaceId);
      appEvents.emit("blockedDays:openMyBlocks", {
        workspaceId: n.workspaceId,
      });
      return;
    }
    if (n.taskId) {
      void navigateToTask({
        taskId: n.taskId,
        workspaceId: n.workspaceId,
      });
    } else if (n.projectId && n.workspaceId) {
      navigateToProject({
        projectId: n.projectId,
        workspaceId: n.workspaceId,
      });
    } else if (n.workspaceId) {
      navigateToWorkspace({ workspaceId: n.workspaceId });
      setActiveWorkspaceId(n.workspaceId);
    }
  }

  function handleClickOverdue(item: OverdueItem) {
    setOpen(false);
    void navigateToTask({
      taskId: item.taskId,
      workspaceId: item.workspaceId,
    });
  }

  const unread = notifications.filter((n) => !n.readAt);
  const read = notifications.filter((n) => n.readAt);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notificaciones"
        title="Notificaciones"
        className={cn(
          "relative grid h-9 w-9 place-items-center rounded-full border border-line bg-white/70 text-ink-soft backdrop-blur transition-all hover:bg-white hover:text-ink",
        )}
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span
            className={cn(
              "absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-prio-coral px-1 text-[9px] font-bold text-white",
            )}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-[80] mt-2 w-72 max-w-[calc(100vw-1rem)] origin-top-right animate-fade-in rounded-2xl border border-line bg-white p-2 shadow-elevated sm:w-80"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <header className="flex items-center justify-between px-3 py-2">
            <span className="text-sm font-bold text-ink">Notificaciones</span>
            {unread.length > 0 && (
              <button
                type="button"
                onClick={() => void markAllAsRead()}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-ink-soft transition-colors hover:bg-surface-muted hover:text-ink"
              >
                <CheckCheck size={11} />
                Marcar todas
              </button>
            )}
          </header>

          <div className="max-h-[480px] overflow-y-auto">
            {isLoading ? (
              <div className="px-3 py-6 text-center text-xs text-ink-muted">
                Cargando...
              </div>
            ) : unreadCount === 0 && read.length === 0 ? (
              <EmptyState />
            ) : (
              <>
                {overdue.length > 0 && (
                  <Section
                    title="Vencidas"
                    icon={<AlertTriangle size={11} />}
                    tone="red"
                  >
                    {overdue.map((item) => (
                      <OverdueRow
                        key={item.syntheticId}
                        item={item}
                        onClick={() => handleClickOverdue(item)}
                      />
                    ))}
                  </Section>
                )}

                {unread.length > 0 && (
                  <Section title="Sin leer" tone="blue">
                    {unread.map((n) => (
                      <NotificationRow
                        key={n.id}
                        notification={n}
                        onClick={() => handleClickNotification(n)}
                      />
                    ))}
                  </Section>
                )}

                {read.length > 0 && (
                  <Section title="Anteriores" tone="muted">
                    {read.slice(0, 20).map((n) => (
                      <NotificationRow
                        key={n.id}
                        notification={n}
                        onClick={() => handleClickNotification(n)}
                        muted
                      />
                    ))}
                  </Section>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Subcomponentes ──────────────────────────────────────────

function Section({
  title,
  icon,
  tone,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  tone: "red" | "blue" | "muted";
  children: React.ReactNode;
}) {
  const toneClasses =
    tone === "red"
      ? "text-red-700"
      : tone === "blue"
        ? "text-prio-blue"
        : "text-ink-muted";
  return (
    <section className="mt-1">
      <div
        className={cn(
          "flex items-center gap-1.5 px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider",
          toneClasses,
        )}
      >
        {icon}
        {title}
      </div>
      <ul className="space-y-0.5">{children}</ul>
    </section>
  );
}

function NotificationRow({
  notification,
  onClick,
  muted = false,
}: {
  notification: Notification;
  onClick: () => void;
  muted?: boolean;
}) {
  const Icon = iconForKind(notification.kind);
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full items-start gap-2.5 rounded-xl px-3 py-2 text-left transition-colors",
          muted ? "opacity-70" : "",
          "hover:bg-surface-muted",
        )}
      >
        <span
          className={cn(
            "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg",
            colorForKind(notification.kind),
          )}
        >
          <Icon size={13} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-ink">
            {notification.title}
          </div>
          {notification.body && (
            <div className="mt-0.5 truncate text-[11px] text-ink-soft">
              {notification.body}
            </div>
          )}
          <div className="mt-0.5 text-[10px] text-ink-muted">
            {formatRelativeFromTimestamp(notification.createdAt)}
          </div>
        </div>
        {!notification.readAt && (
          <span
            aria-hidden
            className="mt-2 h-2 w-2 shrink-0 rounded-full bg-prio-blue"
          />
        )}
      </button>
    </li>
  );
}

function OverdueRow({
  item,
  onClick,
}: {
  item: OverdueItem;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-start gap-2.5 rounded-xl px-3 py-2 text-left transition-colors hover:bg-red-50"
      >
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-red-100 text-red-700">
          <AlertTriangle size={13} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-ink">
            {item.taskTitle}
          </div>
          <div className="mt-0.5 text-[11px] text-red-700">
            Vencida hace {item.daysOverdue}{" "}
            {item.daysOverdue === 1 ? "dia" : "dias"}
          </div>
        </div>
      </button>
    </li>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center px-3 py-10 text-center">
      <span className="grid h-10 w-10 place-items-center rounded-full bg-surface-muted text-ink-muted">
        <Inbox size={16} />
      </span>
      <div className="mt-2 text-xs font-semibold text-ink">Estas al dia</div>
      <p className="mt-1 max-w-[200px] text-[11px] text-ink-muted">
        No tienes nada pendiente por revisar.
      </p>
    </div>
  );
}

function iconForKind(kind: NotificationKind) {
  switch (kind) {
    case "task_assigned":
      return UserPlus;
    case "task_overdue":
      return AlertTriangle;
    case "workspace_invitation":
      return Users;
    case "project_invitation":
      return Mail;
    case "role_changed":
      return ShieldCheck;
    default:
      return Bell;
  }
}

function colorForKind(kind: NotificationKind): string {
  switch (kind) {
    case "task_assigned":
      return "bg-prio-blue/15 text-prio-blue";
    case "task_overdue":
      return "bg-red-100 text-red-700";
    case "workspace_invitation":
      return "bg-prio-green/15 text-prio-green";
    case "project_invitation":
      return "bg-prio-purple/15 text-prio-purple";
    case "role_changed":
      return "bg-prio-coral/15 text-prio-coral";
    default:
      return "bg-surface-muted text-ink-soft";
  }
}
