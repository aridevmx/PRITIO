type EventCallback = () => void;

const listeners = new Map<string, Set<EventCallback>>();

export function onAppEvent(event: string, cb: EventCallback): () => void {
  if (!listeners.has(event)) {
    listeners.set(event, new Set());
  }
  listeners.get(event)!.add(cb);

  return () => {
    listeners.get(event)?.delete(cb);
  };
}

export function emitAppEvent(event: string): void {
  listeners.get(event)?.forEach((cb) => {
    try {
      cb();
    } catch (err) {
      console.error(`[appEvents] Error in listener for "${event}":`, err);
    }
  });
}
