import { createPortal } from "react-dom";

interface RecurrenceEditDialogProps {
  open: boolean;
  onThisOne: () => void;
  onAllFuture: () => void;
  onCancel: () => void;
  title?: string;
}

export function RecurrenceEditDialog({
  open,
  onThisOne,
  onAllFuture,
  onCancel,
  title,
}: RecurrenceEditDialogProps) {
  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-ink/30 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="prio-modal-enter mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-elevated">
        <h3 className="text-lg font-bold text-ink">
          Tarea recurrente
        </h3>
        <p className="mt-2 text-sm text-ink-soft leading-relaxed">
          {title
            ? `"${title}" es una tarea recurrente. ¿Que accion deseas realizar?`
            : "Esta es una tarea recurrente. ¿Que accion deseas realizar?"}
        </p>

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onThisOne}
            className="w-full rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-ink hover:bg-surface-muted transition-colors text-left"
          >
            Solo esta tarea
          </button>
          <button
            type="button"
            onClick={onAllFuture}
            className="w-full rounded-xl bg-prio-blue px-4 py-2.5 text-sm font-semibold text-white hover:bg-prio-blue/90 transition-colors text-left"
          >
            Todas las futuras
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-full rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-ink-soft hover:bg-surface-muted transition-colors text-left"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
