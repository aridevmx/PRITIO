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
    <div className="rounded-xl border border-line bg-surface p-3">
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

      {isExpanded && (
        <div className="mt-2 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => dispatch({ type: "setConfig", config: { workMin: state.workMin + 5 } })}
            disabled={state.running || !!state.pendingChoice}
            className="flex items-center justify-center rounded-lg border border-line bg-surface px-2 py-1.5 text-[11px] font-medium text-ink-muted hover:bg-surface-muted disabled:opacity-40"
            title="Aumentar trabajo +5min"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
              <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <span>{state.workMin} min</span>
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: "setConfig", config: { shortBreakMin: state.shortBreakMin + 5 } })}
            disabled={state.running || !!state.pendingChoice}
            className="flex items-center justify-center rounded-lg border border-line bg-surface px-2 py-1.5 text-[11px] font-medium text-ink-muted hover:bg-surface-muted disabled:opacity-40"
            title="Aumentar descanso corto +5min"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
              <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <span>{state.shortBreakMin} min</span>
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: "setConfig", config: { longBreakMin: state.longBreakMin + 5 } })}
            disabled={state.running || !!state.pendingChoice}
            className="flex items-center justify-center rounded-lg border border-line bg-surface px-2 py-1.5 text-[11px] font-medium text-ink-muted hover:bg-surface-muted disabled:opacity-40"
            title="Aumentar descanso largo +5min"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
              <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <span>{state.longBreakMin} min</span>
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: "setConfig", config: { workMin: Math.max(1, state.workMin - 5) } })}
            disabled={state.running || !!state.pendingChoice}
            className="flex items-center justify-center rounded-lg border border-line bg-surface px-2 py-1.5 text-[11px] font-medium text-ink-muted hover:bg-surface-muted disabled:opacity-40"
            title="Disminuir trabajo -5min"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
              <path d="M3.5 8h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <span>{state.workMin} min</span>
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: "setConfig", config: { shortBreakMin: Math.max(1, state.shortBreakMin - 5) } })}
            disabled={state.running || !!state.pendingChoice}
            className="flex items-center justify-center rounded-lg border border-line bg-surface px-2 py-1.5 text-[11px] font-medium text-ink-muted hover:bg-surface-muted disabled:opacity-40"
            title="Disminuir descanso corto -5min"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
              <path d="M3.5 8h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <span>{state.shortBreakMin} min</span>
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: "setConfig", config: { longBreakMin: Math.max(1, state.longBreakMin - 5) } })}
            disabled={state.running || !!state.pendingChoice}
            className="flex items-center justify-center rounded-lg border border-line bg-surface px-2 py-1.5 text-[11px] font-medium text-ink-muted hover:bg-surface-muted disabled:opacity-40"
            title="Disminuir descanso largo -5min"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
              <path d="M3.5 8h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <span>{state.longBreakMin} min</span>
          </button>
        </div>
      )}

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => dispatch({ type: "skip" })}
          disabled={!!state.pendingChoice}
          className="flex-1 rounded-lg border border-line bg-surface py-2 text-[11px] font-medium text-ink-muted hover:bg-surface-muted disabled:opacity-40"
          title="Saltar fase"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
            <path d="M2 2l6 4-6 4zM9 2h1.5v8H9z" />
          </svg>
          <span className="ml-1">Saltar</span>
        </button>
        <button
          type="button"
          onClick={() => dispatch({ type: "reset" })}
          className="flex-1 rounded-lg border border-line bg-surface py-2 text-[11px] font-medium text-ink-muted hover:bg-surface-muted"
          title="Reiniciar"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M1.5 4.5A4.5 4.5 0 1 1 2 7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <path d="M1.5 1.5v3h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="ml-1">Reiniciar</span>
        </button>
      </div>
    </div>
  );
}
