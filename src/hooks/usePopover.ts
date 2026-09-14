import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

interface UsePopoverOptions {
  /** Anclaje del panel respecto al trigger: borde derecho del trigger por defecto. */
  align?: "left" | "right";
  /** Separación vertical entre trigger y panel (px). */
  offset?: number;
  /** Margen mínimo al borde de la ventana (px). */
  margin?: number;
}

interface PopoverPosition {
  top: number;
  left: number;
}

/**
 * Estado y posicionamiento de un popover en portal:
 * - Calibra el panel contra el viewport (evita desbordes), volteándolo hacia
 *   arriba cuando no cabe debajo del trigger.
 * - Cierra con clic fuera, Escape o scroll/resize (recalcula la posición).
 * - Usa data-pritio-popover para compatibilidad con los demás popovers.
 */
export function usePopover<T extends HTMLElement = HTMLButtonElement>({
  align = "right",
  offset = 8,
  margin = 8,
}: UsePopoverOptions = {}) {
  const anchorRef = useRef<T>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PopoverPosition | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const update = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = panelRef.current?.offsetWidth ?? 280;
      let left =
        align === "left" ? rect.left : rect.right - width;
      left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
      const height = panelRef.current?.offsetHeight ?? 0;
      let top = rect.bottom + offset;
      if (height > 0 && top + height > window.innerHeight - margin) {
        top = Math.max(margin, Math.min(rect.top - height - offset, window.innerHeight - height - margin));
      }
      setPos({ top, left });
    };
    const id = window.requestAnimationFrame(update);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.cancelAnimationFrame(id);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, align, offset, margin]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open]);

  const toggle = useCallback(() => setOpen((v) => !v), []);
  const close = useCallback(() => setOpen(false), []);

  return { anchorRef, panelRef, open, setOpen, toggle, close, pos };
}