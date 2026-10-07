import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn, localDateStr, todayStr, formatDayLabel } from "@/lib/utils";
import { usePopover } from "@/hooks/usePopover";
import { MiniCalendar } from "@/components/layout/MiniCalendar";
import { AppIcon } from "@/components/AppIcon";
import {
  ArrowLeft,
  ArrowRight,
  CalendarBlank,
  CaretRight,
  Check,
  Clock,
  Copy,
  DotsThreeVertical,
  PencilSimple,
  Trash,
} from "@phosphor-icons/react";
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
        <AppIcon glyph={ArrowRight} size="sm" />
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
        <AppIcon glyph={DotsThreeVertical} size="sm" weight="fill" />
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
                    <AppIcon glyph={PencilSimple} />,
                    "Editar",
                    <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-ink-muted">Ctrl E</span>,
                    () => {
                      close();
                      onEdit();
                    },
                    "text-pritio-blue",
                  )}

                  {labeledRow(
                    <AppIcon glyph={CalendarBlank} />,
                    "Fecha",
                    <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-ink-soft">
                      {pickDates.value ? formatDayLabel(pickDates.value) : ""}
                      <AppIcon glyph={CaretRight} size="xs" />
                    </span>,
                    () => setMode("date"),
                  )}

                  {labeledRow(
                    <AppIcon glyph={Check} />,
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
                      <AppIcon glyph={CaretRight} size="xs" className="ml-0.5 text-ink-muted" />
                    </span>,
                    () => setMode("priority"),
                  )}

                  {labeledRow(
                    <AppIcon glyph={Clock} />,
                    "Fecha límite",
                    <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-ink-soft">
                      {pickDeadline.value ? formatDayLabel(pickDeadline.value) : ""}
                      <AppIcon glyph={CaretRight} size="xs" />
                    </span>,
                    () => setMode("deadline"),
                  )}

                  <div className="mx-2 my-1 h-px bg-line" />

                  {labeledRow(
                    <AppIcon glyph={Copy} />,
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
                    <AppIcon glyph={Trash} />
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
                          <AppIcon glyph={Check} size="sm" className="text-pritio-blue" />
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
          <AppIcon glyph={ArrowLeft} size="sm" />
        </button>
        <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">{label}</p>
      </div>
      {children}
    </>
  );
}