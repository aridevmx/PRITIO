import { createPortal } from "react-dom";
import type { Dispatch } from "react";
import type { PomodoroAction, PomodoroState } from "@/features/pomodoro/pomodoroStore";

interface Props {
  state: PomodoroState;
  dispatch: Dispatch<PomodoroAction>;
}

export function PomodoroFinishOverlay({ state, dispatch }: Props) {
  if (!state.pendingChoice) return null;
  const isWorkEnd = state.pendingChoice === "workEnd";

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-6 pritio-modal-enter" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-white p-6 text-center shadow-2xl">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-pritio-green/15 text-3xl">
          {isWorkEnd ? "🍅" : "☕"}
        </div>
        <h2 className="mt-4 text-xl font-bold text-ink">
          {isWorkEnd ? "¡Sesión de trabajo terminada!" : "Descanso terminado"}
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          {isWorkEnd
            ? "Tómate un descanso o sigue con tus tareas."
            : "¿Listo para volver a trabajar?"}
        </p>
        <div className="mt-6 space-y-2">
          {isWorkEnd && (
            <button
              type="button"
              onClick={() => dispatch({ type: "rest" })}
              className="block w-full rounded-xl bg-ink py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              Descansar
            </button>
          )}
          <button
            type="button"
            onClick={() => dispatch(isWorkEnd ? { type: "continue" } : { type: "continue" })}
            className="block w-full rounded-xl border border-line py-3 text-sm font-semibold text-ink transition-colors hover:bg-surface-muted"
          >
            {isWorkEnd ? "Continuar trabajando" : "Volver a trabajar"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
