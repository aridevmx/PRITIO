import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

interface Toast {
  id: number;
  type: "success" | "error" | "info";
  message: string;
}

interface ToastContextValue {
  toast: {
    success: (message: string) => void;
    error: (message: string) => void;
    info: (message: string) => void;
  };
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;

const DURATION_MS = 4000;

const TOAST_ICONS: Record<
  Toast["type"],
  { path: string; iconClassName: string; barClassName: string }
> = {
  success: {
    path: "M2.75 8.25 6.5 12l6.75-7.5",
    iconClassName: "bg-pritio-green/10 text-pritio-green",
    barClassName: "bg-pritio-green",
  },
  error: {
    path: "M8 5v4.25M8 11.5v.5M3 1.75 6.75 5.5m0 0L10.5 1.75M6.75 5.5l-3.75 3.75L6.75 12.5l3.75-3.25-3.75-3.75Z",
    iconClassName: "bg-pritio-coral/10 text-pritio-coral",
    barClassName: "bg-pritio-coral",
  },
  info: {
    path: "M8 5.25V5.2M8 8.5v3.5M3.25 8a4.75 4.75 0 1 1 9.5 0 4.75 4.75 0 0 1-9.5 0Z",
    iconClassName: "bg-pritio-blue/10 text-pritio-blue",
    barClassName: "bg-pritio-blue",
  },
};

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: () => void;
}) {
  const icon = TOAST_ICONS[toast.type];
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    const timeout = setTimeout(onDismiss, DURATION_MS);
    return () => clearTimeout(timeout);
  }, [onDismiss]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setProgress(0));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      role="status"
      className="animate-fade-in pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-2xl border border-line/80 bg-surface px-4 py-3 shadow-elevated"
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${icon.iconClassName}`}
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
          <path
            d={icon.path}
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <p className="min-w-0 flex-1 self-center text-sm font-semibold leading-snug text-ink">
        {toast.message}
      </p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Cerrar"
        className="flex h-6 w-6 shrink-0 items-center justify-center self-center rounded-md text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
          <path
            d="M4 4l8 8m0-8l-8 8"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <span className="absolute bottom-0 left-0 h-0.5 w-full rounded-r-full bg-pritio-blue/0" />
      <span
        className={`absolute bottom-0 left-0 h-0.5 origin-left rounded-r-full ${icon.barClassName}`}
        style={{
          width: `${progress}%`,
          transition: `width ${DURATION_MS}ms linear`,
        }}
      />
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timeoutsRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const removeToast = useCallback((id: number) => {
    const timeout = timeoutsRef.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      timeoutsRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (type: Toast["type"], message: string) => {
      const id = nextId++;
      setToasts((prev) => [...prev, { id, type, message }]);

      const timeout = setTimeout(() => {
        removeToast(id);
      }, DURATION_MS);
      timeoutsRef.current.set(id, timeout);
    },
    [removeToast],
  );

  const value: ToastContextValue = {
    toast: {
      success: (msg) => addToast("success", msg),
      error: (msg) => addToast("error", msg),
      info: (msg) => addToast("info", msg),
    },
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 top-4 z-[10000] flex flex-col items-center gap-2 px-4"
        >
          <div className="flex w-full max-w-sm flex-col gap-2">
            {toasts.map((t) => (
              <ToastItem key={t.id} toast={t} onDismiss={() => removeToast(t.id)} />
            ))}
          </div>
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}
