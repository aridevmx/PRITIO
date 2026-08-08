export type AppEventCallback<T = unknown> = (payload?: T) => void;

const listeners = new Map<string, Set<AppEventCallback>>();

export function onAppEvent<T = unknown>(event: string, cb: AppEventCallback<T>): () => void {
  if (!listeners.has(event)) {
    listeners.set(event, new Set());
  }
  listeners.get(event)!.add(cb as AppEventCallback);

  return () => {
    listeners.get(event)?.delete(cb as AppEventCallback);
  };
}

export function emitAppEvent<T = unknown>(event: string, payload?: T): void {
  listeners.get(event)?.forEach((cb) => {
    try {
      cb(payload);
    } catch (err) {
      console.error(`[appEvents] Error in listener for "${event}":`, err);
    }
  });
}
