import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { localDateStr } from "@/lib/utils";
import { useAuth } from "@/features/auth/AuthProvider";
import { useToast } from "@/components/Toast";
import { inputClass } from "@/features/account/account-styles";
import { cn } from "@/lib/utils";
import type { BlockedDayStatus } from "@/types";

interface MyBlockedDay {
  id: string;
  blockedDate: string;
  reason: string | null;
  status: BlockedDayStatus;
  rejectionReason: string | null;
  workspaceName: string | null;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(`${dateStr}T00:00:00`).toLocaleDateString("es-MX", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  } catch {
    return dateStr;
  }
}

export function BlockedDaysTab() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [days, setDays] = useState<MyBlockedDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDate, setNewDate] = useState("");
  const [newReason, setNewReason] = useState("");
  const [adding, setAdding] = useState(false);

  const loadDays = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("user_blocked_days")
      .select("id, blocked_date, reason, status, rejection_reason, workspaces(name)")
      .eq("user_id", user.id)
      .order("blocked_date", { ascending: true });
    if (error) {
      console.error("[BlockedDaysTab] load error:", error);
      setDays([]);
    } else {
      setDays(
        (data ?? []).map((d) => ({
          id: d.id,
          blockedDate: String(d.blocked_date).slice(0, 10),
          reason: d.reason,
          status: (d.status === "pending" || d.status === "rejected" ? d.status : "approved") as BlockedDayStatus,
          rejectionReason: d.rejection_reason,
          workspaceName:
            (d.workspaces as { name?: string } | null)?.name ?? null,
        })),
      );
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void loadDays();
  }, [loadDays]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !newDate) return;
    setAdding(true);
    try {
      const { error } = await supabase.from("user_blocked_days").insert({
        user_id: user.id,
        workspace_id: null,
        blocked_date: newDate,
        reason: newReason.trim() || null,
      });
      if (error) throw error;
      setNewDate("");
      setNewReason("");
      toast.success("Día bloqueado agregado");
      await loadDays();
    } catch {
      toast.error("Error al agregar el día bloqueado");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(id: string) {
    const { error } = await supabase.from("user_blocked_days").delete().eq("id", id);
    if (error) {
      toast.error("Error al quitar el día");
      return;
    }
    setDays((prev) => prev.filter((d) => d.id !== id));
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleAdd} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-ink-muted">Fecha</label>
          <input
            type="date"
            value={newDate}
            min={localDateStr(new Date())}
            onChange={(e) => setNewDate(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-ink-muted">Motivo (opcional)</label>
          <input
            type="text"
            value={newReason}
            onChange={(e) => setNewReason(e.target.value)}
            placeholder="Ej. fuera de la ciudad"
            className={inputClass}
          />
        </div>
        <button
          type="submit"
          disabled={adding || !newDate}
          className="rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-ink/90 transition-colors disabled:opacity-50"
        >
          {adding ? "Agregando..." : "Agregar"}
        </button>
      </form>

      <div className="overflow-hidden rounded-xl border border-line bg-surface-muted">
        {loading ? (
          <p className="px-4 py-6 text-center text-sm text-ink-muted">Cargando…</p>
        ) : days.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">
            Aún no tienes días bloqueados. Marca tus días de no disponibilidad para que el equipo lo sepa.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {days.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-ink">{formatDate(d.blockedDate)}</p>
                    {d.status === "pending" && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                        Pendiente
                      </span>
                    )}
                    {d.status === "approved" && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                        Aprobado
                      </span>
                    )}
                    {d.status === "rejected" && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700">
                        Rechazado
                      </span>
                    )}
                  </div>
                  <p className={cn("mt-0.5 truncate text-xs text-ink-muted")}>
                    {d.reason || "Sin motivo"}
                    {d.workspaceName ? ` · ${d.workspaceName}` : ""}
                    {d.status === "rejected" && d.rejectionReason
                      ? ` — ${d.rejectionReason}`
                      : ""}
                  </p>
                </div>
                <button
                  onClick={() => handleRemove(d.id)}
                  aria-label={`Quitar día ${d.blockedDate}`}
                  className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold text-pritio-coral hover:bg-pritio-coral/10 transition-colors"
                >
                  {d.status === "pending" ? "Cancelar" : "Quitar"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs leading-relaxed text-ink-muted">
        Los días bloqueados generales aplican a todos tus workspaces y no requieren aprobación.
        Los días que bloquees dentro de un workspace los aprueban los líderes del equipo antes de activarse.
      </p>
    </div>
  );
}
