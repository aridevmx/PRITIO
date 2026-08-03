import { useCallback, useEffect, useRef } from "react";

export function useDebouncedRealtimeRefresh(
  callback: () => void | Promise<void>,
): () => void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);
  const pendingRef = useRef(false);

  callbackRef.current = callback;

  const refresh = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
    }

    pendingRef.current = true;

    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      if (pendingRef.current) {
        pendingRef.current = false;
        void callbackRef.current();
      }
    }, 200);
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return refresh;
}
