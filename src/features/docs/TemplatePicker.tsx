import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import {
  listTemplates,
  type DocTemplate,
} from "@/features/docs/api";

interface TemplatePickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (template: DocTemplate | null) => void;
  workspaceId: string;
}

const CATEGORIES = [
  { id: "all", label: "Todos" },
  { id: "reuniones", label: "Reuniones" },
  { id: "proyectos", label: "Proyectos" },
  { id: "personal", label: "Personal" },
  { id: "general", label: "General" },
] as const;

export function TemplatePicker({
  open,
  onClose,
  onSelect,
  workspaceId,
}: TemplatePickerProps) {
  const [templates, setTemplates] = useState<DocTemplate[]>([]);
  const [category, setCategory] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setIsLoading(true);
    setCategory("all");
    let cancelled = false;
    void listTemplates(workspaceId)
      .then((rows) => {
        if (!cancelled) setTemplates(rows);
      })
      .catch(() => {
        if (!cancelled) setTemplates([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, workspaceId]);

  // Cerrar con Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    if (category === "all") return templates;
    return templates.filter((t) => t.category === category);
  }, [templates, category]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-ink/30 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="pritio-modal-enter mx-4 flex max-h-[80vh] w-full max-w-2xl flex-col rounded-2xl bg-surface shadow-elevated">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h3 className="text-lg font-bold text-ink">Elegir plantilla</h3>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4L4 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Categorías */}
        <div className="flex gap-1 border-b border-line px-6 py-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                category === c.id
                  ? "bg-pritio-blue/10 text-pritio-blue"
                  : "text-ink-soft hover:bg-surface-muted hover:text-ink",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Grid de templates */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-ink-muted">Cargando plantillas…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-ink-muted">No hay plantillas en esta categoría.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {/* Opción "En blanco" siempre primero */}
              <button
                type="button"
                onClick={() => onSelect(null)}
                className="group flex flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong/60 p-4 transition-all hover:border-pritio-blue/50 hover:bg-pritio-blue/5"
              >
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-surface-muted text-2xl transition-colors group-hover:bg-pritio-blue/10">
                  📄
                </span>
                <span className="text-sm font-semibold text-ink">En blanco</span>
                <span className="text-[11px] leading-tight text-ink-muted">Documento vacío</span>
              </button>

              {filtered.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onSelect(t)}
                  className="group flex flex-col items-center gap-2 rounded-xl border border-line p-4 transition-all hover:border-pritio-blue/50 hover:bg-pritio-blue/5"
                >
                  <span className="grid h-12 w-12 place-items-center rounded-xl bg-surface-muted text-2xl transition-colors group-hover:bg-pritio-blue/10">
                    {t.icon || "📄"}
                  </span>
                  <span className="text-sm font-semibold text-ink">{t.name}</span>
                  {t.description && (
                    <span className="line-clamp-2 text-center text-[11px] leading-tight text-ink-muted">
                      {t.description}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
