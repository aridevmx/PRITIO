import { useEffect, useRef, useState, type FormEvent } from "react";
import { emitAppEvent } from "@/lib/appEvents";
import type { CreateTaskDialogOptions } from "@/features/tasks/AddTaskDialog";

/**
 * Barra de captura rápida anclada al fondo de la pantalla (solo Inbox).
 * Sin tarjeta: solo el input. Al enviar (Enter o botón) abre el modal compacto
 * (AddTaskDialog) con el título ya prellenado para terminar la tarea en un par
 * de clicks. Escribir no abre el modal: el input se queda con el foco.
 */
export function BottomQuickAdd() {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onTasksChanged = () => {
      setText("");
      inputRef.current?.focus();
    };
    window.addEventListener("pritio:tasks-changed", onTasksChanged);
    return () => window.removeEventListener("pritio:tasks-changed", onTasksChanged);
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const title = text.trim();
    if (!title) return;
    setText("");
    emitAppEvent<CreateTaskDialogOptions>("pritio:create-task", { title });
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-[55] px-4 lg:bottom-6 lg:px-0">
      <form
        onSubmit={handleSubmit}
        className="pointer-events-auto mx-auto w-full max-w-3xl"
      >
        <div className="flex items-center gap-1 rounded-full border border-line bg-surface/75 py-1 pl-4 pr-1 shadow-elevated backdrop-blur-xl transition-colors focus-within:border-pritio-blue focus-within:ring-2 focus-within:ring-pritio-blue/25">
          <svg
            className="h-4 w-4 shrink-0 text-ink-muted"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden
          >
            <path d="M10 4V16M4 10H16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Captura algo o Cmd+K…"
            aria-label="Captura rápida"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="go"
            className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm text-ink outline-none placeholder:text-ink-muted"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            aria-label="Crear tarea rápida"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink text-white transition-all disabled:cursor-not-allowed disabled:opacity-40 active:scale-95"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none">
              <path d="M10 4v12M5 9l5-5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}