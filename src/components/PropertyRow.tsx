import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

const POPOVER_WIDTH = 288;

interface PropertyRowProps {
  icon: ReactNode;
  /** Nombre accesible; se muestra como tooltip, no visualmente. */
  label: string;
  value?: ReactNode;
  emptyText?: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}

/**
 * Fila-propiedad compacta para el rail de detalles: icono + valor en una
 * línea; al hacer click se despliega un menú flotante anclado con el editor
 * de esa propiedad (estilo Todoist), vía portal para evitar clipping.
 */
export function PropertyRow({
  icon,
  label,
  value,
  emptyText = "Vacío",
  expanded,
  onToggle,
  children,
}: PropertyRowProps) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const hasValue = Array.isArray(value) ? value.length > 0 : Boolean(value);

  useLayoutEffect(() => {
    if (!expanded) {
      setPos(null);
      return;
    }
    const update = () => {
      const rect = btnRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = panelRef.current?.offsetWidth || POPOVER_WIDTH;
      let left = rect.right - width;
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
      const height = panelRef.current?.offsetHeight ?? 0;
      let top = rect.bottom + 6;
      if (height > 0 && top + height > window.innerHeight - 8) {
        top = Math.max(8, Math.min(rect.top - height - 6, window.innerHeight - height - 8));
      }
      setPos({ top, left });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (btnRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      onToggle();
    }
    // Capture: cierra el popover antes de que el Esc del dialog cierre todo.
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onToggle();
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [expanded, onToggle]);

  return (
    <div>
      <button
        ref={btnRef}
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-haspopup="dialog"
        aria-label={label}
        title={label}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-muted",
          !hasValue && "border border-dashed border-line-strong/70",
          expanded && "bg-surface-muted",
          expanded && !hasValue && "border-transparent bg-surface-muted",
        )}
      >
        <span className="grid h-4 w-4 shrink-0 place-items-center text-ink-muted">{icon}</span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-sm font-medium",
            hasValue ? "text-ink" : "text-ink-muted",
          )}
        >
          {hasValue ? value : emptyText}
        </span>
        <svg
          className={cn(
            "h-3 w-3 shrink-0 text-ink-muted transition-transform duration-200",
            expanded && "-rotate-90",
          )}
          viewBox="0 0 16 16"
          fill="none"
        >
          <path
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {expanded &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={label}
            style={{
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              visibility: pos ? "visible" : "hidden",
            }}
            className="pritio-menu-enter fixed z-[10000] max-h-[min(24rem,calc(100vh-1rem))] w-[18rem] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-xl border border-line bg-surface p-2.5 shadow-elevated"
          >
            {children}
          </div>,
          document.body,
        )}
    </div>
  );
}
