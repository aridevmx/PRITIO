import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn, localDateStr, todayStr, formatDayLabel } from "@/lib/utils";
import { usePopover } from "@/hooks/usePopover";
import { MiniCalendar } from "@/components/layout/MiniCalendar";
import { QUADRANTS, QUADRANT_ORDER, type QuadrantMeta } from "@/features/tasks/quadrants";
import type { Quadrant } from "@/types";

function nextWeekdayStr(): string {
  const d = new Date();
  do {
    d.setDate(d.getDate() + 1);
  } while (d.getDay() === 0 || d.getDay() === 6);
  return localDateStr(d);
}

function nextMondayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + (((8 - d.getDay()) % 7) || 7));
  return localDateStr(d);
}

function nextSaturdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + (((6 - d.getDay() + 7) % 7) || 7));
  return localDateStr(d);
}

export interface SubtaskItem {
  key: string;
  id: string | null;
  title: string;
  completed: boolean;
  startDate: string | null;
  dueDate: string | null;
  quadrant: Quadrant | null;
}

interface SubtaskContextMenuProps {
  subtask: SubtaskItem;
  onEdit: () => void;
  onSetStartDate: (date: string | null) => void;
  onSetDueDate: (date: string | null) => void;
  onSetQuadrant: (quadrant: Quadrant | null) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

type MenuMode = "menu" | "date" | "deadline" | "priority" | "custom";

interface MenuApi {
  label: string;
  short: string;
  value: string | null;
  onPick: (date: string | null) => void;
}

const CustomRowIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 16 16" fill="none">
    <path d="M3 8h10M9.5 4.5L13 8l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function SubtaskContextMenu({
  subtask,
  onEdit,
  onSetStartDate,
  onSetDueDate,
  onSetQuadrant,
  onDuplicate,
  onDelete,
}: SubtaskContextMenuProps) {
  const { anchorRef, panelRef, open, toggle, close, pos } = usePopover<HTMLButtonElement>({
    align: "right",
    offset: 4,
  });
  const [mode, setMode] = useState<MenuMode>("menu");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const panelInnerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setMode("menu");
      setConfirmingDelete(false);
      const id = window.setTimeout(() => panelInnerRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  const pickDates: MenuApi = {
    label: "Fecha",
    short: "T",
    value: subtask.startDate,
    onPick: onSetStartDate,
  };
  const pickDeadline: MenuApi = {
    label: "Fecha límite",
    short: "D",
    value: subtask.dueDate,
    onPick: onSetDueDate,
  };

  const renderQuickRows = (api: MenuApi) => (
    <>
      {[
        { label: "Hoy", compute: () => todayStr() },
        { label: "Mañana", compute: () => nextWeekdayStr() },
        { label: "Próxima semana", compute: () => nextMondayStr() },
        { label: "Próximo fin de semana", compute: () => nextSaturdayStr() },
      ].map((opt) => (
        <button
          key={opt.label}
          type="button"
          onClick={() => {
            api.onPick(opt.compute());
            close();
          }}
          className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-ink transition-colors hover:bg-surface-muted"
        >
          <span>{opt.label}</span>
          <span className="text-[11px] font-medium tabular-nums text-ink-soft">
            {formatDayLabel(opt.compute()) || opt.compute()}
          </span>
        </button>
      ))}
      <button
        type="button"
        onClick={() => setMode("custom")}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-medium text-pritio-blue transition-colors hover:bg-pritio-blue/5"
      >
        <CustomRowIcon className="h-3.5 w-3.5" />
        <span>Elegir fecha…</span>
      </button>
      <button
        type="button"
        onClick={() => {
          api.onPick(null);
          close();
        }}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-ink-soft transition-colors hover:bg-surface-muted"
      >
        <span>Sin fecha</span>
      </button>
    </>
  );

  const handleSubmenuKeyDown = (e: React.KeyboardEvent) => {
    if (mode !== "menu") return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "e") {
      e.preventDefault();
      close();
      onEdit();
    } else if (e.key.toLowerCase() === "t") {
      e.preventDefault();
      setMode("date");
    } else if (e.key.toLowerCase() === "q") {
      e.preventDefault();
      setMode("priority");
    } else if (e.key.toLowerCase() === "d") {
      e.preventDefault();
      setMode("deadline");
    } else if (e.key === "Delete" || (e.key === "Backspace" && e.shiftKey)) {
      e.preventDefault();
      setConfirmingDelete((v) => !v);
    }
  };

  const doDelete = () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    close();
    onDelete();
  };

  const labeledRow = (
    icon: React.ReactNode,
    label: string,
    right?: React.ReactNode,
    onClick?: () => void,
    accentClass?: string,
  ) => (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-surface-muted",
        onClick ? "cursor-pointer" : "cursor-default",
      )}
    >
      <span className={cn("grid h-4 w-4 shrink-0 place-items-center", accentClass ?? "text-ink-muted")}>
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-ink">{label}</span>
      {right}
    </button>
  );

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={toggle}
        aria-label={`Menú de subtarea: ${subtask.title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-ink-muted opacity-0 transition-all hover:bg-surface-muted hover:text-ink focus-visible:opacity-100 group-hover/sub:opacity-100"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="3.25" r="1.25" />
          <circle cx="8" cy="8" r="1.25" />
          <circle cx="8" cy="12.75" r="1.25" />
        </svg>
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            data-pritio-popover="true"
            role="menu"
            aria-label="Opciones de subtarea"
            style={{
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              visibility: pos ? "visible" : "hidden",
            }}
            className="pritio-menu-enter fixed z-[10002] w-[16.5rem] max-w-[calc(100vw-1rem)] rounded-xl border border-line bg-surface p-1.5 shadow-elevated"
          >
            <div
              ref={panelInnerRef}
              tabIndex={-1}
              onKeyDown={handleSubmenuKeyDown}
              className="outline-none"
            >
              {mode === "menu" && (
                <>
                  {labeledRow(
                    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                      <path d="M10.5 2.5l3 3-6.5 6.5H4v-3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                    </svg>,
                    "Editar",
                    <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-ink-muted">Ctrl E</span>,
                    () => {
                      close();
                      onEdit();
                    },
                    "text-pritio-blue",
                  )}

                  {labeledRow(
                    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                      <rect x="2.5" y="3" width="11" height="10.5" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
                      <path d="M5.5 1.5V4.5M10.5 1.5V4.5M2.5 6.5h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>,
                    "Fecha",
                    <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-ink-soft">
                      {pickDates.value ? formatDayLabel(pickDates.value) : ""}
                      <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none">
                        <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>,
                    () => setMode("date"),
                  )}

                  {labeledRow(
                    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                      <path d="M3 8l2.5 2.5L13 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>,
                    "Cuadrante",
                    <span className="flex shrink-0 items-center gap-1">
                      {QUADRANT_ORDER.map((q) => {
                        const meta: QuadrantMeta = QUADRANTS[q];
                        const active = subtask.quadrant === q;
                        return (
                          <span
                            key={q}
                            className={cn(
                              "h-2.5 w-2.5 rounded-full transition-opacity",
                              meta.classes.accentBg,
                              active ? "opacity-100" : "opacity-30",
                            )}
                          />
                        );
                      })}
                      <svg className="ml-0.5 h-3 w-3 text-ink-muted" viewBox="0 0 16 16" fill="none">
                        <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>,
                    () => setMode("priority"),
                  )}

                  {labeledRow(
                    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                      <path d="M8 13.5A5.5 5.5 0 118 2.5a5.5 5.5 0 010 11z" stroke="currentColor" strokeWidth="1.4" />
                      <path d="M8 5.5V8l2 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>,
                    "Fecha límite",
                    <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-ink-soft">
                      {pickDeadline.value ? formatDayLabel(pickDeadline.value) : ""}
                      <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none">
                        <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>,
                    () => setMode("deadline"),
                  )}

                  <div className="mx-2 my-1 h-px bg-line" />

                  {labeledRow(
                    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                      <rect x="5" y="5" width="8.5" height="8.5" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
                      <path d="M11 3.5V2.5A1.5 1.5 0 009.5 1H4A1.5 1.5 0 002.5 2.5V10A1.5 1.5 0 004 11.5h.5" stroke="currentColor" strokeWidth="1.4" />
                    </svg>,
                    "Duplicar",
                    undefined,
                    () => {
                      close();
                      onDuplicate();
                    },
                  )}

                  <button
                    type="button"
                    onClick={doDelete}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
                      confirmingDelete
                        ? "bg-pritio-coral/10 text-pritio-coral"
                        : "text-pritio-coral hover:bg-pritio-coral/10",
                    )}
                  >
                    <svg className="h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="none">
                      <path d="M3 4h10M6.5 4V2.5h3V4M4.5 4l.75 9h5.5l.75-9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="min-w-0 flex-1 truncate">
                      {confirmingDelete ? "¿Eliminar definitivamente?" : "Eliminar"}
                    </span>
                    <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-ink-muted">
                      Shift ⌫
                    </span>
                  </button>
                </>
              )}

              {mode === "date" && (
                <SubmenuHeader label="Fecha" onBack={() => setMode("menu")}>
                  {renderQuickRows(pickDates)}
                </SubmenuHeader>
              )}
              {mode === "deadline" && (
                <SubmenuHeader label="Fecha límite" onBack={() => setMode("menu")}>
                  {renderQuickRows(pickDeadline)}
                </SubmenuHeader>
              )}

              {mode === "priority" && (
                <SubmenuHeader label="Cuadrante" onBack={() => setMode("menu")}>
                  {QUADRANT_ORDER.map((q) => {
                    const meta: QuadrantMeta = QUADRANTS[q];
                    const active = subtask.quadrant === q;
                    return (
                      <button
                        key={q}
                        type="button"
                        onClick={() => {
                          onSetQuadrant(active ? null : q);
                          close();
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-ink transition-colors hover:bg-surface-muted"
                      >
                        <span className={cn("h-3 w-3 shrink-0 rounded-full", meta.classes.accentBg)} />
                        <span className="min-w-0 flex-1 truncate">{meta.title}</span>
                        {active && (
                          <svg className="h-3.5 w-3.5 shrink-0 text-pritio-blue" viewBox="0 0 16 16" fill="none">
                            <path d="M3.5 8.5l3 3 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </SubmenuHeader>
              )}

              {mode === "custom" && (
                <SubmenuHeader label="Elegir fecha" onBack={() => setMode("date")}>
                  <div className="px-1">
                    <MiniCalendar
                      taskDates={[]}
                      blockedDates={[]}
                      alwaysClickable
                      selectedDate={pickDates.value || null}
                      initialDate={pickDates.value || undefined}
                      onDayClick={(d) => {
                        pickDates.onPick(d);
                        close();
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      pickDates.onPick(todayStr());
                      close();
                    }}
                    className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-medium text-pritio-blue transition-colors hover:bg-pritio-blue/5"
                  >
                    <span>Hoy</span>
                  </button>
                </SubmenuHeader>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function SubmenuHeader({
  label,
  onBack,
  children,
}: {
  label: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="mb-1 flex items-center gap-1.5 px-1">
        <button
          type="button"
          onClick={onBack}
          className="rounded-md p-1 text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
          aria-label="Volver al menú"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
            <path d="M13 8H3M6.5 4.5L3 8l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">{label}</p>
      </div>
      {children}
    </>
  );
}