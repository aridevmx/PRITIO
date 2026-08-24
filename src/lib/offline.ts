import { get, set, del } from "idb-keyval";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// ─── Conectividad ────────────────────────────────────────────

export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(isOnline);
  useEffect(() => {
    const up = () => {
      setOnline(true);
      void flushOutbox();
    };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    if (isOnline()) void flushOutbox();
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
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

export type OfflineOpKind = "task_update" | "doc_upsert";

export interface OfflineOp {
  id: string;
  kind: OfflineOpKind;
  workspaceId: string;
  rowId: string;
  /** Patch en formato de columnas de la base (snake_case). */
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
  return op;
}

export async function getOutbox(): Promise<OfflineOp[]> {
  try {
    return (await get<OfflineOp[]>(OUTBOX_KEY)) ?? [];
  } catch {
    return [];
  }
}

async function removeOp(id: string): Promise<void> {
  const list = (await get<OfflineOp[]>(OUTBOX_KEY)) ?? [];
  await set(
    OUTBOX_KEY,
    list.filter((o) => o.id !== id),
  );
}

let flushing = false;

/**
 * Reproduce las ediciones encoladas. Último escrito gana: el patch se aplica
 * tal cual sobre la fila remota al reconectar.
 */
export async function flushOutbox(): Promise<number> {
  if (flushing || !isOnline()) return 0;
  flushing = true;
  let applied = 0;
  try {
    const ops = await getOutbox();
    for (const op of ops) {
      try {
        const table =
          op.kind === "task_update"
            ? "tasks"
            : op.kind === "doc_upsert"
              ? "docs"
              : null;
        if (!table) {
          await removeOp(op.id);
          continue;
        }

        const { error } =
          op.kind === "doc_upsert"
            ? await supabase.from(table).upsert(
                { id: op.rowId, ...op.payload, updated_at: op.queuedAt },
                { onConflict: "id" },
              )
            : await supabase.from(table).update(op.payload).eq("id", op.rowId);

        if (error) throw error;
        await removeOp(op.id);
        notifyOutboxChanged();
        applied++;
      } catch (err) {
        console.error("flushOutbox: op fallida", op.kind, op.rowId, err);
        // Se reintenta en el siguiente flush.
      }
    }
  } finally {
    flushing = false;
  }
  return applied;
}
