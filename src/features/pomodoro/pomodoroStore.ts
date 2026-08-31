import { useEffect, useReducer, useRef } from "react";
import { playSound } from "@/lib/sounds";

export type PomodoroPhase = "work" | "shortBreak" | "longBreak";

export interface PomodoroConfig {
  workMin: number;
  shortBreakMin: number;
  longBreakMin: number;
  cyclesBeforeLong: number;
  tick: boolean;
}

export interface PomodoroState extends PomodoroConfig {
  phase: PomodoroPhase;
  remaining: number;
  cyclesCompleted: number;
  running: boolean;
  /** Notificación de pantalla completa pendiente al terminar un bloque. */
  pendingChoice: "workEnd" | "breakEnd" | null;
}

export type PomodoroAction =
  | { type: "toggle" }
  | { type: "tick" }
  | { type: "reset" }
  | { type: "rest" }
  | { type: "continue" }
  | { type: "skip" }
  | { type: "setConfig"; config: Partial<PomodoroConfig> };

const DEFAULT_CONFIG: PomodoroConfig = {
  workMin: 25,
  shortBreakMin: 5,
  longBreakMin: 15,
  cyclesBeforeLong: 4,
  tick: true,
};

function phaseSeconds(config: PomodoroConfig, phase: PomodoroPhase): number {
  return phase === "work"
    ? config.workMin * 60
    : phase === "shortBreak"
      ? config.shortBreakMin * 60
      : config.longBreakMin * 60;
}

function nextBreakPhase(config: PomodoroConfig, cyclesCompleted: number): PomodoroPhase {
  return cyclesCompleted % config.cyclesBeforeLong === 0 ? "longBreak" : "shortBreak";
}

export function initialPomodoroState(partial?: Partial<PomodoroConfig>): PomodoroState {
  const config = { ...DEFAULT_CONFIG, ...partial };
  return { ...config, phase: "work", remaining: config.workMin * 60, cyclesCompleted: 0, running: false, pendingChoice: null };
}

export function pomodoroReducer(state: PomodoroState, action: PomodoroAction): PomodoroState {
  switch (action.type) {
    case "toggle":
      if (state.pendingChoice) return state;
      return { ...state, running: !state.running };

    case "tick": {
      if (!state.running || state.pendingChoice) return state;
      if (state.remaining > 0) {
        return { ...state, remaining: state.remaining - 1 };
      }
      // Bloque terminado
      if (state.phase === "work") {
        return { ...state, remaining: 0, running: false, cyclesCompleted: state.cyclesCompleted + 1, pendingChoice: "workEnd" };
      }
      return { ...state, remaining: 0, running: false, pendingChoice: "breakEnd" };
    }

    case "reset":
      return { ...state, remaining: phaseSeconds(state, state.phase), running: false, pendingChoice: null };

    case "rest": {
      const phase = nextBreakPhase(state, state.cyclesCompleted);
      return { ...state, phase, remaining: phaseSeconds(state, phase), running: true, pendingChoice: null };
    }

    case "continue":
      return { ...state, phase: "work", remaining: phaseSeconds(state, "work"), running: true, pendingChoice: null };

    case "skip": {
      const phase = state.phase === "work" ? "shortBreak" : "work";
      return { ...state, phase, remaining: phaseSeconds(state, phase), running: true };
    }

    case "setConfig": {
      const config = {
        workMin: action.config.workMin ?? state.workMin,
        shortBreakMin: action.config.shortBreakMin ?? state.shortBreakMin,
        longBreakMin: action.config.longBreakMin ?? state.longBreakMin,
        cyclesBeforeLong: action.config.cyclesBeforeLong ?? state.cyclesBeforeLong,
        tick: action.config.tick ?? state.tick,
      };
      // Recalcular el tiempo restante para la fase actual.
      const remaining = phaseSeconds(config, state.phase);
      return { ...state, ...config, remaining };
    }

    default:
      return state;
  }
}

/** Persistencia en localStorage (config + progreso; sin break points entre sesiones). */
export function loadPomodoroState(): PomodoroState {
  try {
    const raw = localStorage.getItem("pritio:pomodoro");
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PomodoroState>;
      const config: Partial<PomodoroConfig> = {
        workMin: parsed.workMin,
        shortBreakMin: parsed.shortBreakMin,
        longBreakMin: parsed.longBreakMin,
        cyclesBeforeLong: parsed.cyclesBeforeLong,
        tick: parsed.tick,
      };
      return {
        ...initialPomodoroState(config),
        phase: parsed.phase ?? "work",
        // El temporizador no continúa corriendo entre recargas.
        remaining: parsed.remaining ?? (parsed.workMin ?? DEFAULT_CONFIG.workMin) * 60,
        cyclesCompleted: parsed.cyclesCompleted ?? 0,
        running: false,
        pendingChoice: null,
      };
    }
  } catch {
    /* ignorar localStorage corrupto */
  }
  return initialPomodoroState();
}

function persistPomodoroState(state: PomodoroState): void {
  try {
    localStorage.setItem(
      "pritio:pomodoro",
      JSON.stringify({
        workMin: state.workMin,
        shortBreakMin: state.shortBreakMin,
        longBreakMin: state.longBreakMin,
        cyclesBeforeLong: state.cyclesBeforeLong,
        tick: state.tick,
        phase: state.phase,
        remaining: state.remaining,
        cyclesCompleted: state.cyclesCompleted,
      }),
    );
  } catch {
    /* ignorar */
  }
}

export function usePomodoro() {
  const [state, dispatch] = useReducer(pomodoroReducer, undefined, loadPomodoroState);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    persistPomodoroState(state);
  }, [state]);

  // Tick por segundo.
  useEffect(() => {
    if (!state.running || state.pendingChoice) return;
    const iv = window.setInterval(() => dispatch({ type: "tick" }), 1000);
    return () => window.clearInterval(iv);
  }, [state.running, state.pendingChoice]);

  // Sonidos: tic-tac al terminar un segundo que se acumula (cada segundo mientras corre).
  useEffect(() => {
    if (!state.running || state.pendingChoice || !state.tick) return;
    const iv = window.setInterval(() => playSound("pomodoroTick"), 1000);
    return () => window.clearInterval(iv);
  }, [state.running, state.pendingChoice, state.tick, state.phase]);

  // Sonido de fin al llegar a un pendiente de decisión.
  useEffect(() => {
    if (state.pendingChoice) playSound("pomodoroEnd");
  }, [state.pendingChoice]);

  return { state, dispatch };
}
