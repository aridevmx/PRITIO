import { useCallback, useEffect, useRef, type RefObject } from "react";

interface UseModalEnterOptions {
  pageScrollAbsolute?: number;
  pageScrollNudge?: number;
}

interface UseModalEnterResult {
  backdropRef: RefObject<HTMLDivElement | null>;
  handleMouseDown: (e: React.MouseEvent) => void;
}

export function useModalEnter(
  options?: UseModalEnterOptions,
): UseModalEnterResult {
  const backdropRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const scrollY = window.scrollY;

    if (options?.pageScrollAbsolute !== undefined) {
      window.scrollTo(0, options.pageScrollAbsolute);
    } else if (options?.pageScrollNudge !== undefined) {
      window.scrollTo(0, scrollY + options.pageScrollNudge);
    }

    return () => {
      window.scrollTo(0, scrollY);
    };
  }, [options?.pageScrollAbsolute, options?.pageScrollNudge]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isBackdropClickOutside(e, backdropRef)) {
        const event = new CustomEvent("modal-backdrop-click");
        backdropRef.current?.dispatchEvent(event);
      }
    },
    [],
  );

  return { backdropRef, handleMouseDown };
}

function isBackdropClickOutside(
  e: React.MouseEvent,
  ref: RefObject<HTMLDivElement | null>,
): boolean {
  if (!ref.current) return false;
  return e.target === ref.current;
}

export { isBackdropClickOutside as isBackdropClickOutsideUtil };
