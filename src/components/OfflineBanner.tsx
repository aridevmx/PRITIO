import { useEffect, useState } from "react";
import {
  getOutbox,
  startAutoSync,
  startConnectivityMonitor,
  useOnlineStatus,
} from "@/lib/offline";

/** Banner fijo que avisa pérdida de conexión y sincroniza al volver. */
export function OfflineBanner() {
  const online = useOnlineStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [justSynced, setJustSynced] = useState(false);

  useEffect(() => {
    const refreshPending = () => {
      void getOutbox().then((ops) => setPendingCount(ops.length));
    };
    void refreshPending();

    // Arranca el monitor de conectividad real y el drenaje automático del
    // outbox (ambos idempotentes, una sola vez por sesión).
    const stopMonitor = startConnectivityMonitor();
    const stopAutoSync = startAutoSync();

    const onSynced = () => {
      setJustSynced(true);
      window.setTimeout(() => setJustSynced(false), 2500);
    };
    const refresh = () => void refreshPending();

    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    window.addEventListener("pritio:outbox-changed", refresh);
    window.addEventListener("pritio:synced", onSynced);

    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
      window.removeEventListener("pritio:outbox-changed", refresh);
      window.removeEventListener("pritio:synced", onSynced);
      stopMonitor();
      stopAutoSync();
    };
  }, []);

  if (online && !justSynced && (pendingCount === 0)) return null;

  return (
    <div
      role="status"
      className={
        "fixed bottom-4 left-1/2 z-[9990] flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold shadow-elevated " +
        (!online
          ? "bg-ink text-white"
          : justSynced
            ? "bg-pritio-green text-white"
            : "bg-pritio-coral text-white")
      }
    >
      {!online ? (
        <>
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
            <path d="M2 6a9 9 0 0112 0M4.5 8.5a5.5 5.5 0 017 0M7 11a2 2 0 012 0M8 13.5h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M2.5 2l11 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          Sin conexión
          {pendingCount > 0 && ` · ${pendingCount} cambio(s) en espera`}
        </>
      ) : pendingCount > 0 ? (
        <>Sincronizando {pendingCount} cambio(s)…</>
      ) : (
        <>Cambios sincronizados</>
      )}
    </div>
  );
}
