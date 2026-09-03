import { get, set, del } from "idb-keyval";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// ─── Conectividad ────────────────────────────────────────────
//
// `navigator.onLine` es poco fiable: solo cambia con eventos de interfaz
// de red y puede reportar `true` aunque el servidor sea inalcanzable.
// Para detectar la conectividad real hacemos un "heartbeat" ligero contra
// la API de Supabase con un timeout corto. El estado se comparte de forma
// global para que todos los consumidores vean lo mismo y un único ciclo de
// detección dispare el flush del outbox.

let sharedOnline: boolean | null = null;
let heartbeatTimer: number | undefined;
let heartbeatFires = false;
let monitorRefCount = 0;
const listenerCallbacks = new Set<(online: boolean) => void>();

function notifyListeners(online: boolean): void {
  listenerCallbacks.forEach((cb) => cb(online));
}

/**
 * Comprueba la conectividad real mediante un request ligero con timeout.
 * Devuelve `true` si respondió el servidor y `false` si no hubo respuesta.
 */
async function probeConnectivity(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 4000);
    // Supabase expone un endpoint de health del auth. Incluso un 4xx/5xx de
    // Supabase prueba que hay conectividad; solo la ausencia de respuesta
    // (o timeout) significa sin red.
    const url = `${import.meta.env.VITE_SUPABASE_URL}/auth/v1/health`;
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    window.clearTimeout(timer);
    return typeof res.status === "number";
  } catch {
    return false;
  }
}

function applyOnlineChange(newOnline: boolean): void {
  if (sharedOnline === newOnline) return;
  sharedOnline = newOnline;
  notifyListeners(newOnline);
  if (newOnline) {
    // Al recuperar la conexión, vaciar la cola de pendientes.
    void flushOutbox();
  }
}

function runHeartbeat(): void {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    // La interfaz dice que no hay red; no gastar peticiones.
    applyOnlineChange(false);
    return;
  }
  void probeConnectivity().then(applyOnlineChange);
}

/**
 * Arranca el ciclo de detección de conectividad. Es idempotente y usa un
 * contador de referencias: `stop()` solo limpia cuando el último consumidor
 * se va. El estado se comparte entre todos los consumidores de la sesión.
 */
export function startConnectivityMonitor(): () => void {
  const onNativeUp = () => applyOnlineChange(true);
  const onNativeDown = () => applyOnlineChange(false);

  const stop = (): void => {
    monitorRefCount--;
    if (monitorRefCount > 0) return;
    if (heartbeatTimer !== undefined) {
      window.clearInterval(heartbeatTimer);
      heartbeatTimer = undefined;
    }
    window.removeEventListener("online", onNativeUp);
    window.removeEventListener("offline", onNativeDown);
    listenerCallbacks.clear();
    sharedOnline = null;
    heartbeatFires = false;
  };

  if (heartbeatTimer !== undefined) {
    monitorRefCount++;
    return stop;
  }

  sharedOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
  monitorRefCount = 1;
  heartbeatTimer = window.setInterval(runHeartbeat, 15_000);
  if (heartbeatFires === false) {
    heartbeatFires = true;
    runHeartbeat();
  }

  window.addEventListener("online", onNativeUp);
  window.addEventListener("offline", onNativeDown);

  return stop;
}

/**
 * Devuelve si el cliente tiene conectividad real. Si el monitor todavía no
 * ha probado la red, cae a `navigator.onLine`.
 */
export function isOnline(): boolean {
  return sharedOnline ?? (typeof navigator === "undefined" ? true : navigator.onLine);
}

/**
 * Detecta si un error lanzado por un request a Supabase es de red (sin
 * conexión) y no de datos/permisos. Esto permite encolar offline operaciones
 * que fallaron porque la red cayó a mitad de un request.
 */
export function isNetworkError(err: unknown): boolean {
  if (!err) return false;
  const msg =
    err instanceof Error ? err.message : typeof err === "string" ? err : String(err);
  const lower = msg.toLowerCase();
  return (
    msg.includes("Failed to fetch") ||
    msg.includes("NetworkError") ||
    msg.includes("Network Error") ||
    msg.includes("network request failed") ||
    msg.includes("fetch failed") ||
    msg.includes("La solicitud tardó demasiado") ||
    lower.includes("network") ||
    lower.includes("fetch") ||
    lower.includes("timeout") ||
    lower.includes("socket") ||
    lower.includes("connection")
  );
}

/** Hook React que reacciona a cambios de conectividad real. */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(isOnline);

  useEffect(() => {
    listenerCallbacks.add(setOnline);
    const stop = startConnectivityMonitor();
    return () => {
      listenerCallbacks.delete(setOnline);
      stop();
    };
  }, []);

  return online;
}

// ─── Caché de lectura (snapshots por vista/workspace) ───────

export async function saveSnapshot<T>(key: string, data: T): Promise<void> {
  try {
    await set(`pritio:snap:${key}`, { savedAt: Date.now(), data });
  } catch {
    // almacenamiento lleno o no disponible: ignorar
  }
}

export async function loadSnapshot<T>(key: string): Promise<{ savedAt: number; data: T } | null> {
  try {
    return (await get(`pritio:snap:${key}`)) ?? null;
  } catch {
    return null;
  }
}

export async function clearSnapshot(key: string): Promise<void> {
  try {
    await del(`pritio:snap:${key}`);
  } catch {
    // ignorar
  }
}

// ─── Outbox de ediciones sin conexión ───────────────────────

export type OfflineOpKind = "task_update" | "task_create" | "task_delete" | "doc_upsert";

export interface OfflineOp {
  id: string;
  kind: OfflineOpKind;
  workspaceId: string;
  rowId: string;
  /** Patch en formato de columnas de la base (snake_case). Para
   *  `task_create` incluye todas las columnas necesarias para un insert. */
  payload: Record<string, unknown>;
  queuedAt: string;
}

const OUTBOX_KEY = "pritio:outbox";

function notifyOutboxChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("pritio:outbox-changed"));
  }
}

function newOpId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `op-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function queueOfflineOp(
  kind: OfflineOpKind,
  workspaceId: string,
  rowId: string,
  payload: Record<string, unknown>,
): Promise<OfflineOp> {
  const op: OfflineOp = {
    id: newOpId(),
    kind,
    workspaceId,
    rowId,
    payload,
    queuedAt: new Date().toISOString(),
  };
  const list = (await get<OfflineOp[]>(OUTBOX_KEY)) ?? [];
  list.push(op);
  await set(OUTBOX_KEY, list);
  notifyOutboxChanged();
  // Si hay red en el momento de encolar (p. ej. un guardado fallido por un
  // error puntual), intentar drenar enseguida.
  if (isOnline()) void flushOutbox();
  return op;
}

export async function getOutbox(): Promise<OfflineOp[]> {
  try {
    return (await get<OfflineOp[]>(OUTBOX_KEY)) ?? [];
  } catch {
    return [];
  }
}

async function replaceOutbox(list: OfflineOp[]): Promise<void> {
  await set(OUTBOX_KEY, list);
}

let flushing = false;

function emitSynced(applied: number): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("pritio:synced", { detail: { applied } }));
  }
}

/**
 * Reproduce las ediciones encoladas. Último escrito gana: el patch se aplica
 * tal cual sobre la fila remota al reconectar. Las ops fallidas se reintentan
 * en el siguiente flush (no se pierden); las ops sin sentido se descartan.
 */
export async function flushOutbox(): Promise<number> {
  if (flushing || !isOnline()) return 0;
  const ops = await getOutbox();
  if (ops.length === 0) return 0;

  flushing = true;
  let applied = 0;
  try {
    // Trabajamos sobre una copia para no perder ops si algo falla a mitad.
    let remaining = ops;
    for (const op of ops) {
      let table: string | null = null;
      if (op.kind === "task_update" || op.kind === "task_create" || op.kind === "task_delete") {
        table = "tasks";
      } else if (op.kind === "doc_upsert") table = "docs";

      if (!table) {
        remaining = remaining.filter((o) => o.id !== op.id);
        continue;
      }

      try {
        if (op.kind === "task_create") {
          const { error } = await supabase
            .from(table)
            .insert({ id: op.rowId, ...op.payload })
            .select("id");
          if (error) throw error;
        } else if (op.kind === "task_delete") {
          const { error } = await supabase.from(table).delete().eq("id", op.rowId);
          if (error) throw error;
        } else if (op.kind === "doc_upsert") {
          const { error } = await supabase
            .from(table)
            .upsert(
              { id: op.rowId, ...op.payload, updated_at: op.queuedAt },
              { onConflict: "id" },
            );
          if (error) throw error;
        } else {
          const { error } = await supabase.from(table).update(op.payload).eq("id", op.rowId);
          if (error) throw error;
        }

        remaining = remaining.filter((o) => o.id !== op.id);
        applied++;
      } catch (err) {
        if (isNetworkError(err)) {
          // Pérdida de red en medio de un request: reintentar en el siguiente
          // ciclo. Sin red el resto de ops tampoco progresará.
          console.error("flushOutbox: op reintentando por red", op.kind, op.rowId, err);
          break;
        }
        // Error definitivo (permisos, fila inexistente, constraint): descartar
        // esta op para no bloquear el outbox en bucle. Se anota y se continúa
        // con las demás.
        console.error("flushOutbox: op descartada", op.kind, op.rowId, err);
        remaining = remaining.filter((o) => o.id !== op.id);
      }
    }
    await replaceOutbox(remaining);
    if (remaining.length > 0 && isOnline()) {
      // Quedaron ops (por red o porque seguimos procesando): mantener un
      // flujo de reintento periódico.
      flushIntervalCheck();
    } else {
      stopAutoSyncTimer();
    }
    notifyOutboxChanged();
  } finally {
    flushing = false;
  }
  if (applied > 0) emitSynced(applied);
  return applied;
}

// ─── Monitor de drenaje periódico del outbox ───────────────

let autoSyncTimer: number | undefined;

function stopAutoSyncTimer(): void {
  if (autoSyncTimer !== undefined) {
    window.clearInterval(autoSyncTimer);
    autoSyncTimer = undefined;
  }
}

/** Revisa si quedan ops pendientes y, si hay red, las drena. */
function flushIntervalCheck(): void {
  if (autoSyncTimer !== undefined) return;
  autoSyncTimer = window.setInterval(async () => {
    const pending = await getOutbox();
    if (pending.length === 0) {
      stopAutoSyncTimer();
      return;
    }
    if (isOnline()) void flushOutbox();
  }, 8000);
}

/**
 * Arranca el monitor de sincronización automática del outbox. Debe llamarse
 * una vez al cargar la app autenticada. Es idempotente.
 */
export function startAutoSync(): () => void {
  void flushOutbox();
  flushIntervalCheck();
  // Al reconectar la red (incluso sin el monitor de conectividad), drenar.
  const onUp = () => void flushOutbox();
  window.addEventListener("online", onUp);
  return () => {
    stopAutoSyncTimer();
    window.removeEventListener("online", onUp);
  };
}
