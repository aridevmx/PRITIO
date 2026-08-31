import { useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { formatTime, useTimeFormat } from "@/lib/timeFormat";
import type { BlockedDayStatus, Workspace } from "@/types";

type PopoverFilter = "all" | "task" | "event" | "meeting" | "blocked";

interface CalendarItem {
  id: string;
  title: string;
  kind: "task" | "event" | "meeting";
  startAt: string | null;
  completed: boolean;
  workspaceId: string;
}

interface SidebarDayPopoverProps {
  dateStr: string;
  items: CalendarItem[];
  blockedBy: { name: string; userId: string; reason: string | null; status: BlockedDayStatus }[];
  isBlocked: boolean;
  loading: boolean;
  scope: "workspace" | "all";
  workspaces: Workspace[];
  myUserId: string;
  blockedEnabled: boolean;
  needsApproval: boolean;
  onToggleBlocked: (reason?: string) => void;
  onNavigateToCalendar: () => void;
  onClose: () => void;
}

const FILTERS: { key: PopoverFilter; label: string }[] = [
  { key: "all", label: "Todo" },
  { key: "task", label: "Tareas" },
  { key: "event", label: "Eventos" },
  { key: "meeting", label: "Juntas" },
  { key: "blocked", label: "Bloqueados" },
];

function itemTime(a: CalendarItem): number {
  if (a.startAt) return new Date(a.startAt).getTime();
  return 0;
}

export function SidebarDayPopover({
  dateStr,
  items,
  blockedBy,
  isBlocked,
  loading,
  scope,
  workspaces,
  myUserId,
  blockedEnabled,
  needsApproval,
  onToggleBlocked,
  onNavigateToCalendar,
  onClose,
}: SidebarDayPopoverProps) {
  const timeFormat = useTimeFormat();
  const [filter, setFilter] = useState<PopoverFilter>("all");
  const [showReason, setShowReason] = useState(false);
  const [reason, setReason] = useState("");

  const formatted = new Date(dateStr + "T12:00:00").toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const workspaceMap = workspaces.reduce<Record<string, Workspace>>((acc, w) => {
    acc[w.id] = w;
    return acc;
  }, {});

  const sortedItems = [...items].sort((a, b) => itemTime(a) - itemTime(b));

  const visibleItems =
    filter === "all"
      ? sortedItems
      : filter === "blocked"
        ? []
        : sortedItems.filter((i) => i.kind === filter);

  const showBlockedSection = filter === "all" || filter === "blocked";

  const hasContent = visibleItems.length > 0 || (showBlockedSection && blockedBy.length > 0);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-ink/20 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="pritio-modal-enter mx-4 flex max-h-[80vh] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-elevated">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h4 className="text-sm font-bold text-ink capitalize">{formatted}</h4>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Filters */}
        <div className="border-b border-line px-4 py-2">
          <div className="flex gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={cn(
                  "whitespace-nowrap rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors",
                  filter === f.key
                    ? "bg-ink text-white"
                    : "text-ink-muted hover:bg-surface-muted hover:text-ink-soft",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="py-6 text-center text-xs text-ink-soft">Cargando...</p>
          ) : !hasContent ? (
            <p className="py-6 text-center text-xs text-ink-muted">Sin actividades este día</p>
          ) : (
            <div className="space-y-2">
              {visibleItems.map((item) => {
                const ws = workspaceMap[item.workspaceId];
                const originLabel =
                  scope === "all" && ws
                    ? ws.type === "team"
                      ? `Equipo: ${ws.name}`
                      : ws.type === "family"
                        ? "Familia"
                        : "Personal"
                    : undefined;

                return (
                  <div
                    key={item.id}
                    className={cn(
                      "rounded-xl border border-line px-3 py-2",
                      item.completed && "opacity-60",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {item.kind === "meeting" && (
                        <svg
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pritio-purple"
                          viewBox="0 0 16 16"
                          fill="none"
                          aria-hidden
                        >
                          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
                          <path d="M8 4.5V8L10.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      )}
                      {item.kind === "event" && (
                        <svg
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pritio-coral"
                          viewBox="0 0 16 16"
                          fill="none"
                          aria-hidden
                        >
                          <rect x="2.5" y="3" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                          <path d="M2.5 6.5H13.5" stroke="currentColor" strokeWidth="1.3" />
                          <path d="M5.5 1.5V4M10.5 1.5V4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      )}
                      {item.kind === "task" && (
                        <svg
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pritio-blue"
                          viewBox="0 0 16 16"
                          fill="none"
                          aria-hidden
                        >
                          <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" />
                          <circle cx="8" cy="8" r="2" fill="currentColor" />
                        </svg>
                      )}
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "text-sm font-medium text-ink",
                            item.completed && "line-through text-ink-muted",
                          )}
                        >
                          {item.title}
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          {item.startAt && (
                            <span className="text-[10px] font-semibold text-pritio-blue">
                              {formatTime(new Date(item.startAt), timeFormat)}
                            </span>
                          )}
                          {originLabel && (
                            <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
                              [{originLabel}]
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {showBlockedSection && blockedBy.length > 0 && (
                <div className="space-y-2 pt-1">
                  {blockedBy.some((b) => b.status === "approved") && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
                      <p className="text-[11px] font-semibold text-rose-700 mb-1">Día bloqueado por:</p>
                      {blockedBy
                        .filter((b) => b.status === "approved")
                        .map((b, i) => (
                          <p key={`${b.userId}-${i}`} className="text-[11px] text-rose-700/90">
                            <span className="font-semibold">{b.userId === myUserId ? "Tú" : b.name}</span>
                            {b.reason ? ` — ${b.reason}` : ""}
                          </p>
                        ))}
                    </div>
                  )}
                  {blockedBy.some((b) => b.status === "pending") && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                      <p className="text-[11px] font-semibold text-amber-700 mb-1">Pendiente de aprobación:</p>
                      {blockedBy
                        .filter((b) => b.status === "pending")
                        .map((b, i) => (
                          <p key={`${b.userId}-${i}`} className="text-[11px] text-amber-700/90">
                            <span className="font-semibold">{b.userId === myUserId ? "Tú" : b.name}</span>
                            {b.reason ? ` — ${b.reason}` : ""}
                          </p>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="border-t border-line p-4 space-y-2">
          {blockedEnabled &&
            (isBlocked ? (
              <button
                type="button"
                onClick={() => onToggleBlocked()}
                className="flex w-full items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-100 transition-colors"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 12 12" fill="none">
                  <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M3.5 3.5L8.5 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                Quitar bloqueo
              </button>
            ) : blockedBy.some((b) => b.userId === myUserId && b.status === "pending") ? (
              <button
                type="button"
                onClick={() => onToggleBlocked()}
                className="flex w-full items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 12 12" fill="none">
                  <path d="M4 12L12 4M4 4L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                Cancelar solicitud
              </button>
            ) : blockedBy.some((b) => b.userId === myUserId && b.status === "rejected") ? (
              <button
                type="button"
                onClick={() => setShowReason(true)}
                className="flex w-full items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 12 12" fill="none">
                  <path d="M3.5 4L8.5 8M8.5 4L3.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                Reintentar solicitud
              </button>
            ) : showReason ? (
              <div className="space-y-1.5">
                <input
                  autoFocus
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onToggleBlocked(reason);
                  }}
                  placeholder="Motivo (opcional)"
                  className="w-full rounded-lg border border-line bg-surface-subtle px-3 py-2 text-xs text-ink placeholder:text-ink-muted focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-400/20"
                />
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => onToggleBlocked(reason)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-rose-500 px-3 py-2 text-xs font-medium text-white hover:bg-rose-600 transition-colors"
                  >
                    {needsApproval ? "Solicitar día" : "Bloquear día"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowReason(false);
                      setReason("");
                    }}
                    className="rounded-lg border border-line px-3 py-2 text-xs font-medium text-ink-muted hover:bg-surface-muted transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowReason(true)}
                className="flex w-full items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs font-medium text-ink-muted hover:bg-surface-muted transition-colors"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 12 12" fill="none">
                  <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M3.5 3.5L8.5 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                {needsApproval ? "Solicitar día" : "Bloquear día"}
              </button>
            ))}

          <button
            type="button"
            onClick={onNavigateToCalendar}
            className="w-full rounded-lg bg-pritio-blue py-2 text-xs font-semibold text-white hover:bg-pritio-blue/90 transition-colors"
          >
            Ver en calendario
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
