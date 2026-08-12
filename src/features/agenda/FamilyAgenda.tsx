import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useBilling } from "@/features/billing/BillingProvider";
import { createAgendaEvent, deleteAgendaEvent, listAgendaEvents } from "@/features/agenda/api";
import type { AgendaEvent } from "@/types";

interface FamilyAgendaProps {
  workspaceId: string;
}

const FEATURE_LOCKED = "agenda_events";

export function FamilyAgenda({ workspaceId }: FamilyAgendaProps) {
  const { hasFeature, canCreate } = useBilling();
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const available = hasFeature(FEATURE_LOCKED);

  const load = useCallback(() => {
    if (!available) {
      setEvents([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    listAgendaEvents(workspaceId)
      .then(setEvents)
      .catch((err) => {
        console.error("[FamilyAgenda] load error:", err);
        setEvents([]);
      })
      .finally(() => setLoading(false));
  }, [available, workspaceId]);

  useEffect(() => {
    load();
  }, [load]);

  const today = new Date().toISOString().slice(0, 10);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!available) return;
    if (!title.trim() || !date) return;
    if (!canCreate(FEATURE_LOCKED)) return;
    setSaving(true);
    setError(null);
    try {
      await createAgendaEvent(workspaceId, {
        title,
        startsAt: new Date(`${date}T09:00:00`).toISOString(),
      });
      setTitle("");
      setDate("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo agregar el evento");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("¿Eliminar este evento de la agenda?")) return;
    try {
      await deleteAgendaEvent(id);
      setEvents((prev) => prev.filter((ev) => ev.id !== id));
    } catch (err) {
      console.error("[FamilyAgenda] delete error:", err);
    }
  }

  if (!available) {
    return (
      <aside className="w-72 shrink-0 rounded-2xl border border-line bg-surface p-4">
        <h3 className="text-sm font-bold text-ink">Agenda familiar</h3>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">
          La agenda familiar está disponible en el plan Pro. Actívala para coordinar
          eventos con tu familia.
        </p>
      </aside>
    );
  }

  return (
    <aside className="w-72 shrink-0 self-start rounded-2xl border border-line bg-surface p-4">
      <h3 className="text-sm font-bold text-ink">Agenda familiar</h3>
      <p className="mt-0.5 text-xs text-ink-muted">
        Eventos compartidos con tu familia.
      </p>

      <form onSubmit={(e) => void handleAdd(e)} className="mt-3 space-y-2">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ej. Cena familiar"
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-pritio-blue focus:outline-none focus:ring-2 focus:ring-pritio-blue/20"
        />
        <div className="flex gap-2">
          <input
            type="date"
            value={date}
            min={today}
            onChange={(e) => setDate(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-pritio-blue focus:outline-none focus:ring-2 focus:ring-pritio-blue/20"
          />
          <button
            type="submit"
            disabled={saving || !title.trim() || !date}
            className="shrink-0 rounded-lg bg-gradient-to-r from-pritio-purple to-pritio-blue px-3 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "..." : "Agregar"}
          </button>
        </div>
      </form>

      {error && <p className="mt-2 text-xs font-medium text-pritio-coral">{error}</p>}

      <div className="mt-3 max-h-[28rem] space-y-1.5 overflow-y-auto">
        {loading ? (
          <p className="py-2 text-center text-xs text-ink-soft">Cargando...</p>
        ) : events.length === 0 ? (
          <p className="py-2 text-center text-xs text-ink-muted">Sin eventos todavía</p>
        ) : (
          events.map((ev) => (
            <div
              key={ev.id}
              className="group flex items-center gap-2 rounded-xl border border-line px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{ev.title}</p>
                <p className="text-[11px] text-ink-muted capitalize">
                  {new Date(ev.startsAt).toLocaleDateString("es-MX", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleDelete(ev.id)}
                aria-label={`Eliminar ${ev.title}`}
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-muted",
                  "opacity-0 transition-opacity hover:bg-pritio-coral/10 hover:text-pritio-coral group-hover:opacity-100",
                )}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
                  <path d="M2.5 4.5H13.5M6 2.5H10M5.5 4.5L6 13.5H10L10.5 4.5M6.7 7V11M9.3 7V11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
