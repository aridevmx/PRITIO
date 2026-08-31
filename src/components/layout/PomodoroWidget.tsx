import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import {
  usePomodoro,
  type PomodoroPhase,
} from "@/features/pomodoro/pomodoroStore";
import {
  useExpandedWidget,
  useWidgetPrefs,
} from "@/lib/widgetPrefs";
import { PomodoroFinishOverlay } from "./PomodoroFinishOverlay";

const ALLOWED_WORKSPACE_TYPES = new Set(["personal", "team"]);

interface FloatPrefs {
  x: number;
  y: number;
  minimized: boolean;
  width: number;
  height: number;
}

const FLOAT_KEY = "pritio:pomodoroFloat";

function loadFloatPrefs(): FloatPrefs {
  try {
    const raw = localStorage.getItem(FLOAT_KEY);
    if (raw) return { y: 80, minimized: false, width: 260, height: 120, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { x: Math.max(16, window.innerWidth - 280), y: 80, minimized: false, width: 260, height: 120 };
}

function persistFloatPrefs(p: FloatPrefs) {
  try {
    localStorage.setItem(FLOAT_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

const PHASE_LABEL: Record<PomodoroPhase, string> = {
  work: "Trabajo",
  shortBreak: "Descanso corto",
  longBreak: "Descanso largo",
};

const PHASE_COLOR: Record<PomodoroPhase, string> = {
  work: "text-pritio-red",
  shortBreak: "text-pritio-green",
  longBreak: "text-pritio-blue",
};

function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function ProgressRing({ pct, className }: { pct: number; className?: string }) {
  const R = 26;
  const C = 2 * Math.PI * R;
  return (
    <svg viewBox="0 0 64 64" className={cn("h-9 w-9", className)} aria-hidden>
      <circle cx="32" cy="32" r={R} strokeWidth="5" className="stroke-line" fill="none" />
      <circle
        cx="32"
        cy="32"
        r={R}
        strokeWidth="5"
        stroke="currentColor"
        fill="none"
        strokeLinecap="round"
        strokeDasharray={C}
        strokeDashoffset={C * (1 - Math.min(1, pct))}
        transform="rotate(-90 32 32)"
        className="transition-[stroke-dashoffset] duration-300 ease-linear"
      />
    </svg>
  );
}

export function PomodoroWidget() {
  const { workspaceType } = useWorkspace();
  const { pomodoroVisible } = useWidgetPrefs();
  const { expanded, expand } = useExpandedWidget();
  const { state, dispatch } = usePomodoro();

  const showInSidebar =
    pomodoroVisible && ALLOWED_WORKSPACE_TYPES.has(workspaceType);
  const isExpanded = expanded === "pomodoro";

  return (
    <>
      {showInSidebar && (
        <SidebarPomodoro
          state={state}
          dispatch={dispatch}
          isExpanded={isExpanded}
          onExpand={() => expand(isExpanded ? null : "pomodoro")}
        />
      )}
      <PomodoroFinishOverlay state={state} dispatch={dispatch} />
      <FloatingPomodoro state={state} dispatch={dispatch} />
    </>
  );
}

function SidebarPomodoro({
  state,
  dispatch,
  isExpanded,
  onExpand,
}: {
  state: ReturnType<typeof usePomodoro>["state"];
  dispatch: ReturnType<typeof usePomodoro>["dispatch"];
  isExpanded: boolean;
  onExpand: () => void;
}) {
  const total =
    state.phase === "work"
      ? state.workMin * 60
      : state.phase === "shortBreak"
        ? state.shortBreakMin * 60
        : state.longBreakMin * 60;
  const pct = total > 0 ? state.remaining / total : 0;

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Pomodoro</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onExpand}
            title={isExpanded ? "Reducir" : "Agrandar"}
            className="grid h-7 w-7 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" aria-hidden>
              {isExpanded ? (
                <path d="M9 4H12V7M7 12H4V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <path d="M4 7H7V4M12 9H9V12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              )}
            </svg>
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: "toggle" })}
            disabled={!!state.pendingChoice}
            title={state.running ? "Pausar" : "Iniciar"}
            className="grid h-7 w-7 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink disabled:opacity-40"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
              {state.running ? (
                <path d="M3.5 2v8M8.5 2v8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              ) : (
                <path d="M3 2l7 4-7 4z" />
              )}
            </svg>
          </button>
        </div>
      </div>

      <div
        className={cn(
          "mt-1 flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2",
          isExpanded && "py-3",
        )}
      >
        <ProgressRing pct={pct} className={PHASE_COLOR[state.phase]} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xl font-semibold tabular-nums text-ink">{mmss(state.remaining)}</span>
            <span className="truncate text-[11px] font-medium text-ink-muted">{PHASE_LABEL[state.phase]}</span>
          </div>
          <div className="mt-0.5 flex items-center justify-between">
            <span className="text-[11px] text-ink-muted">
              {state.running ? "en curso" : state.pendingChoice ? "finalizado" : "pausado"}
            </span>
            <span className="text-[11px] text-ink-muted">ciclo {state.cyclesCompleted}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function FloatingPomodoro({
  state,
  dispatch,
}: {
  state: ReturnType<typeof usePomodoro>["state"];
  dispatch: ReturnType<typeof usePomodoro>["dispatch"];
}) {
  const [prefs, setPrefs] = useState<FloatPrefs>(loadFloatPrefs);
  const [floating, setFloating] = useState<boolean>(() => {
    try {
      return localStorage.getItem(FLOAT_KEY) !== null;
    } catch {
      return false;
    }
  });
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizeState = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  const persist = (p: FloatPrefs) => {
    prefsRef.current = p;
    setPrefs(p);
    persistFloatPrefs(p);
    try {
      localStorage.setItem(FLOAT_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const beginDrag = (e: React.PointerEvent) => {
    const cur = prefsRef.current;
    if (cur.minimized) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = { startX: e.clientX, startY: e.clientY, origX: cur.x, origY: cur.y };
  };
  const onDrag = (e: React.PointerEvent) => {
    const d = dragState.current;
    if (!d) return;
    const cur = prefsRef.current;
    persist({ ...cur, x: Math.max(8, d.origX + e.clientX - d.startX), y: Math.max(8, d.origY + e.clientY - d.startY) });
  };
  const endDrag = () => {
    dragState.current = null;
  };

  const beginResize = (e: React.PointerEvent) => {
    const cur = prefsRef.current;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    resizeState.current = { startX: e.clientX, startY: e.clientY, origW: cur.width, origH: cur.height };
  };
  const onResize = (e: React.PointerEvent) => {
    const d = resizeState.current;
    if (!d) return;
    const cur = prefsRef.current;
    persist({
      ...cur,
      width: Math.max(180, d.origW + (e.clientX - d.startX)),
      height: Math.max(70, d.origH + (e.clientY - d.startY)),
    });
  };
  const endResize = () => {
    resizeState.current = null;
  };

  const total =
    state.phase === "work"
      ? state.workMin * 60
      : state.phase === "shortBreak"
        ? state.shortBreakMin * 60
        : state.longBreakMin * 60;
  const pct = total > 0 ? state.remaining / total : 0;

  const content = (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-line bg-white shadow-xl",
        prefs.minimized ? "w-40" : "w-full",
      )}
      style={prefs.minimized ? undefined : { height: prefs.height }}
    >
      <div
        className={cn("flex cursor-grab select-none items-center justify-between border-b border-line bg-surface-muted px-3 active:cursor-grabbing", prefs.minimized ? "py-1" : "py-2")}
        onPointerDown={beginDrag}
        onPointerMove={onDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-muted">
          <span className="h-2 w-2 rounded-full bg-pritio-red" />
          Pomodoro
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => persist({ ...prefsRef.current, minimized: !prefsRef.current.minimized })}
            className="grid h-6 w-6 place-items-center rounded-md text-ink-muted hover:bg-line/60 hover:text-ink"
            title={prefs.minimized ? "Expandir" : "Minimizar"}
          >
            <svg className="h-3 w-3" viewBox="0 0 10 10" fill="none" aria-hidden>
              {prefs.minimized ? (
                <path d="M1.5 5h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              ) : (
                <path d="M1.5 5h7M5 1.5v7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              )}
            </svg>
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              setFloating(false);
              try {
                localStorage.removeItem(FLOAT_KEY);
              } catch {
                /* ignore */
              }
            }}
            className="grid h-6 w-6 place-items-center rounded-md text-ink-muted hover:bg-line/60 hover:text-ink"
            title="Volver al sidebar"
          >
            <svg className="h-3 w-3" viewBox="0 0 10 10" fill="none" aria-hidden>
              <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {!prefs.minimized && (
        <div className="flex items-center gap-3 px-3 pb-3">
          <ProgressRing pct={pct} className={cn("h-12 w-12", PHASE_COLOR[state.phase])} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-2xl font-semibold tabular-nums text-ink">{mmss(state.remaining)}</span>
              <span className="text-[11px] font-medium text-ink-muted">{PHASE_LABEL[state.phase]}</span>
            </div>
            <div className="mt-1 flex items-center gap-1">
              <button
                type="button"
                onClick={() => dispatch({ type: "toggle" })}
                disabled={!!state.pendingChoice}
                className="grid h-7 flex-none place-items-center rounded-lg bg-ink px-2.5 text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                <svg className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
                  {state.running ? (
                    <path d="M3.5 2v8M8.5 2v8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  ) : (
                    <path d="M3 2l7 4-7 4z" />
                  )}
                </svg>
              </button>
              <button
                type="button"
                onClick={() => dispatch({ type: "skip" })}
                className="grid h-7 w-7 place-items-center rounded-lg border border-line text-ink-muted hover:bg-surface-muted"
                title="Saltar fase"
              >
                <svg className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
                  <path d="M2 2l6 4-6 4zM9 2h1.5v8H9z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => dispatch({ type: "reset" })}
                className="grid h-7 w-7 place-items-center rounded-lg border border-line text-ink-muted hover:bg-surface-muted"
                title="Reiniciar"
              >
                <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" aria-hidden>
                  <path d="M1.5 4.5A4.5 4.5 0 1 1 2 7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  <path d="M1.5 1.5v3h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (!floating) {
    return (
      <button
        type="button"
        onClick={() => {
          setFloating(true);
          persist(loadFloatPrefs());
        }}
        className="fixed bottom-4 right-4 z-[9000] hidden items-center gap-1.5 rounded-full border border-line bg-white py-1.5 pl-2 pr-3 text-xs font-semibold text-ink shadow-lg transition-colors hover:bg-surface-muted md:flex"
        title="Desprender pomodoro"
      >
        <span className="h-2 w-2 rounded-full bg-pritio-red" />
        Pomodoro
      </button>
    );
  }

  return createPortal(
    <div
      className="fixed z-[9000]"
      style={{ left: prefs.x, top: prefs.y, width: prefs.minimized ? "auto" : prefs.width }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).dataset.resize !== "true") return;
      }}
    >
      {content}
      {!prefs.minimized && (
        <div
          data-resize="true"
          onPointerDown={beginResize}
          onPointerMove={onResize}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          className="absolute -bottom-1 -right-1 h-3 w-3 cursor-nwse-resize rounded-sm border border-line bg-white shadow"
          title="Redimensionar"
        />
      )}
    </div>,
    document.body,
  );
}
