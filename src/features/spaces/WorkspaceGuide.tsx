import { useState } from "react";

interface WorkspaceGuideProps {
  workspaceName: string;
  workspaceId: string;
  hasMembers: boolean;
  onCreateTask: () => void;
  onOpenSettings: () => void;
  onGoToPlan: () => void;
  onDismiss: () => void;
}

const GUIDE_DISMISS_KEY = "pritio:guideDismissed";

export function isWorkspaceGuideDismissed(workspaceId: string): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    const raw = localStorage.getItem(GUIDE_DISMISS_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as string[];
    return parsed.includes(workspaceId);
  } catch {
    return false;
  }
}

export function dismissWorkspaceGuide(workspaceId: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(GUIDE_DISMISS_KEY);
    const parsed: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    if (!parsed.includes(workspaceId)) {
      localStorage.setItem(GUIDE_DISMISS_KEY, JSON.stringify([...parsed, workspaceId]));
    }
  } catch {
    // ignore
  }
}

const STEPS = [
  {
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none">
        <path d="M6.5 3.5h7v5.5l-3.5 3.5H6.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M10 7v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    title: "Crea tu primera tarea",
    description: "Anótala y elige su cuadrante. Las tareas urgentes e importantes van primero.",
  },
  {
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none">
        <circle cx="7" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M2.5 15.5c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M13.5 4a2.5 2.5 0 010 4M14 11.5c1.8.6 3 1.9 3 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    title: "Invita a tu equipo",
    description: "Agrega miembros para asignar tareas, dividir el trabajo y mantener el foco.",
  },
  {
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none">
        <rect x="3" y="3" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <rect x="11" y="3" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <rect x="3" y="11" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <rect x="11" y="11" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
    title: "Explora tus vistas",
    description: "Pasa de Cuadrantes a Plan, Tablero o Calendario para ver el trabajo a tu manera.",
  },
];

export function WorkspaceGuide({
  workspaceName,
  hasMembers,
  onCreateTask,
  onOpenSettings,
  onGoToPlan,
  onDismiss,
}: WorkspaceGuideProps) {
  const [hidden, setHidden] = useState(false);

  if (hidden) return null;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center px-4 py-10">
      <div className="w-full rounded-2xl border border-line bg-surface shadow-sm">
        <div className="relative border-b border-line p-6 sm:p-8">
          <button
            type="button"
            onClick={() => {
              setHidden(true);
              onDismiss();
            }}
            className="absolute right-4 top-4 rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink-soft"
            aria-label="Ocultar guía"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-pritio-purple to-pritio-blue text-white">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none">
                <path d="M5 5l4 9 1.5-6 1 4.5L13 5h6v14h-2.5v-5l-1 3.5H9L5 5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-ink">Empieza con «{workspaceName}»</h2>
              <p className="mt-1 text-sm text-ink-soft">
                Tu espacio está vacío. Organiza tu día en tres pasos simples.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 p-6 sm:grid-cols-3 sm:p-8">
          {STEPS.map((step, i) => (
            <div key={step.title} className="flex flex-col rounded-xl border border-line bg-surface-muted/60 p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-pritio-purple/10 text-pritio-purple">
                  {step.icon}
                </span>
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink text-[11px] font-bold text-white">
                  {i + 1}
                </span>
              </div>
              <h3 className="text-sm font-bold text-ink">{step.title}</h3>
              <p className="mt-1 flex-1 text-xs leading-relaxed text-ink-soft">{step.description}</p>
              {i === 0 && (
                <button
                  type="button"
                  onClick={onCreateTask}
                  className="mt-3 rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-ink/90"
                >
                  Nueva tarea
                </button>
              )}
              {i === 1 && hasMembers && (
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="mt-3 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-surface-muted"
                >
                  Gestionar miembros
                </button>
              )}
              {i === 2 && (
                <button
                  type="button"
                  onClick={onGoToPlan}
                  className="mt-3 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-surface-muted"
                >
                  Ver el plan
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center gap-3 border-t border-line px-6 py-4 sm:flex-row sm:justify-between">
          <p className="text-xs text-ink-muted">La guía desaparece cuando agregues tu primera tarea.</p>
          <button
            type="button"
            onClick={() => {
              setHidden(true);
              onDismiss();
            }}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-pritio-blue transition-colors hover:bg-pritio-blue/5"
          >
            Entendido, por ahora no
          </button>
        </div>
      </div>
    </div>
  );
}
