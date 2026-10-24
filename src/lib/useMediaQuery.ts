import { useEffect, useState } from "react";

/** Hook reactivo de media queries. Por defecto false si no hay window. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** `true` en viewports de escritorio (≥ lg). */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 1024px)");
}