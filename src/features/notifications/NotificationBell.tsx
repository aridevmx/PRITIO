import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { mapNotification } from "@/lib/mappers";
import { formatRelativeTime } from "@/features/tasks/dates";
import { listPendingApprovals } from "@/features/tasks/api";
import { listPendingBlockedDays } from "@/features/calendar/blockedDaysApi";
import { ApprovalsDialog } from "@/features/tasks/ApprovalsDialog";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import { cn } from "@/lib/utils";
import type { Notification, NotificationRow } from "@/types";

let channelKeyCounter = 0;

export function NotificationBell() {
  const { currentWorkspace, isLeader } = useWorkspace();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [approvalsOpen, setApprovalsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const fetchPendingApprovals = useCallback(async () => {
    if (!isLeader || !currentWorkspace) {
      setPendingApprovals(0);
      return;
    }
    try {
      const [pendingTasks, pendingDays] = await Promise.all([
        listPendingApprovals(currentWorkspace.id),
        listPendingBlockedDays(currentWorkspace.id),
      ]);
      setPendingApprovals(pendingTasks.length + pendingDays.length);
    } catch {
      setPendingApprovals(0);
    }
  }, [isLeader, currentWorkspace]);

  const fetchNotifications = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    setNotifications((data ?? []).map(mapNotification));
  }, []);

  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    void fetchPendingApprovals();
  }, [fetchPendingApprovals]);

  useEffect(() => {
    if (isOpen) void fetchPendingApprovals();
  }, [isOpen, fetchPendingApprovals]);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled || !user) return;

      channelKeyCounter++;
      channel = supabase
        .channel(`notifications-${user.id}-${channelKeyCounter}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            const notif = mapNotification(payload.new as unknown as NotificationRow);
            setNotifications((prev) => {
              if (prev.some((n) => n.id === notif.id)) return prev;
              return [notif, ...prev];
            });
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            const row = payload.new as Record<string, unknown>;
            setNotifications((prev) =>
              prev.map((n) => (n.id === row.id ? { ...n, read: Boolean(row.read) } : n)),
            );
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const markAllRead = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", user.id)
      .eq("read", false);

    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  return (
    <div className="relative" ref={panelRef} data-tour="notificaciones">
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Notificaciones"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className="relative grid h-9 w-9 place-items-center rounded-xl text-ink-soft transition-colors hover:bg-surface-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pritio-blue/40"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-pritio-coral px-1 text-[10px] font-bold leading-none text-white ring-2 ring-surface">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="pritio-menu-enter absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-line bg-surface shadow-elevated">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h3 className="text-sm font-bold text-ink">Notificaciones</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs font-medium text-pritio-blue hover:underline"
              >
                Marcar todo como leído
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {pendingApprovals > 0 && (
              <button
                onClick={() => {
                  setApprovalsOpen(true);
                  setIsOpen(false);
                }}
                className="flex w-full items-center gap-2.5 border-b border-line bg-amber-50/60 px-4 py-3 text-left transition-colors hover:bg-amber-50"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700">
                  <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                    <path d="M8 1.5L14 13.5H2L8 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-amber-900">
                    {pendingApprovals === 1
                      ? "1 pendiente por revisar"
                      : `${pendingApprovals} pendientes por revisar`}
                  </span>
                  <span className="block text-xs text-amber-800/80">Aprobar tareas y días bloqueados</span>
                </span>
                <svg className="h-4 w-4 shrink-0 text-amber-700/60" viewBox="0 0 16 16" fill="none">
                  <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
            {notifications.length === 0 ? (
              <div className="py-8 text-center text-sm text-ink-muted">
                Estás al día
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    "border-b border-line px-4 py-3 last:border-0",
                    !n.read && "bg-pritio-blue/5",
                  )}
                >
                  <p className="text-sm font-semibold text-ink">{n.title}</p>
                  <p className="mt-0.5 text-xs text-ink-soft">{n.body}</p>
                  <p className="mt-1 text-[10px] text-ink-muted">
                    {formatRelativeTime(n.createdAt)}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <ApprovalsDialog
        open={approvalsOpen}
        workspaceId={currentWorkspace?.id ?? null}
        onClose={() => {
          setApprovalsOpen(false);
          void fetchPendingApprovals();
        }}
      />
    </div>
  );
}
