import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import { listInvitations, cancelInvitation } from "@/features/invitations/api";
import { InvitationModal } from "@/features/invitations/InvitationModal";
import { ProjectsManager } from "@/features/projects/ProjectsManager";
import { useToast } from "@/components/Toast";
import { useBilling } from "@/features/billing/BillingProvider";
import { parsePlanLimitError } from "@/features/billing/guarded";
import { openUpgrade } from "@/features/billing/upgrade";
import type { Invitation } from "@/types";

type ManageTab = "members" | "projects" | "recurring";

interface ManageDialogProps {
  workspaceId: string;
  workspaceName: string;
}

type MemberRow =
  | { kind: "active"; key: string; assigneeId: string; name: string; color: string }
  | { kind: "inactive"; key: string; assigneeId: string; name: string; color: string }
  | { kind: "pending"; key: string; id: string; email: string };

function MembersPanel({
  workspaceId,
  workspaceName,
  isOwner,
}: {
  workspaceId: string;
  workspaceName: string;
  isOwner: boolean;
}) {
  const { toast } = useToast();
  const { canCreate } = useBilling();
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [assigneesRes, pendingList] = await Promise.all([
        supabase
          .from("assignees")
          .select("id, name, color, linked_user_id")
          .eq("workspace_id", workspaceId),
        listInvitations(workspaceId),
      ]);

      const assignees = assigneesRes.data ?? [];
      const pending: Invitation[] = (pendingList ?? []).filter((inv) => !inv.acceptedAt);

      const nextRows: MemberRow[] = [];
      assignees.forEach((a: { id: string; name: string; color: string; linked_user_id: string | null }) => {
        nextRows.push(
          a.linked_user_id
            ? { kind: "active", key: `a-${a.id}`, assigneeId: a.id, name: a.name, color: a.color }
            : { kind: "inactive", key: `i-${a.id}`, assigneeId: a.id, name: a.name, color: a.color },
        );
      });
      pending.forEach((inv) => {
        nextRows.push({ kind: "pending", key: `p-${inv.id}`, id: inv.id, email: inv.email });
      });
      setRows(nextRows);
    } catch (err) {
      console.error("[MembersPanel] load error:", err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    if (!canCreate("assignees")) return;
    setAdding(true);
    try {
      const { error } = await supabase.from("assignees").insert({
        workspace_id: workspaceId,
        name: newName.trim(),
        color: "#" + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0"),
      });
      if (error) throw error;
      setNewName("");
      await load();
      toast.success("Responsable agregado");
    } catch (err) {
      const resource = parsePlanLimitError(err);
      if (resource) {
        openUpgrade(resource);
        return;
      }
      toast.error("Error al agregar responsable");
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      const { error } = await supabase.from("assignees").delete().eq("id", id);
      if (error) throw error;
      await load();
      toast.success("Responsable eliminado");
    } catch {
      toast.error("Error al eliminar responsable");
    }
  };

  const handleCancelInvitation = async (id: string) => {
    try {
      await cancelInvitation(id);
      await load();
      toast.success("Invitación cancelada");
    } catch {
      toast.error("Error al cancelar invitación");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-ink">Miembros y responsables</p>
        {isOwner && (
          <button
            type="button"
            onClick={() => setInviteOpen(true)}
            className="rounded-xl bg-ink px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-ink/90"
          >
            Invitar miembro
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-pritio-blue" />
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line py-6 text-center text-sm text-ink-muted">
          Sin miembros todavía. Agrega responsables o invita a tu equipo.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((row) => (
            <li
              key={row.key}
              className="flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2"
            >
              <span
                className="h-7 w-7 shrink-0 rounded-full"
                style={row.kind === "pending" ? undefined : { backgroundColor: row.color }}
              />
              {row.kind === "pending" ? (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{row.email}</p>
                    <p className="text-[11px] font-semibold text-ink-muted">Invitación pendiente</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCancelInvitation(row.id)}
                    className="rounded-lg px-2 py-1 text-xs font-semibold text-pritio-coral transition-colors hover:bg-pritio-coral/5"
                  >
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{row.name}</p>
                    <p className="text-[11px] font-semibold text-ink-muted">
                      {row.kind === "active" ? "Responsable activo" : "Responsable sin cuenta"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemove(row.assigneeId)}
                    aria-label="Eliminar responsable"
                    className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-red-50 hover:text-red-500"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 12 12" fill="none">
                      <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-muted">
          Agregar responsable manual
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
            placeholder="Nombre del responsable"
            className="flex-1 rounded-xl border border-line bg-surface-subtle px-3.5 py-2 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-pritio-blue focus:ring-1 focus:ring-pritio-blue/20"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={!newName.trim() || adding}
            className="rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-ink/90 disabled:opacity-50"
          >
            {adding ? "..." : "Agregar"}
          </button>
        </div>
      </div>

      {inviteOpen && (
        <InvitationModal
          workspaceId={workspaceId}
          workspaceName={workspaceName}
          onClose={() => setInviteOpen(false)}
          onSent={() => void load()}
        />
      )}
    </div>
  );
}

const TABS: { id: ManageTab; label: string }[] = [
  { id: "members", label: "Miembros" },
  { id: "projects", label: "Proyectos" },
  { id: "recurring", label: "Recurrentes" },
];

const RECURRENCE_LABELS: Record<string, string> = {
  daily: "Diario",
  weekly: "Semanal",
  monthly: "Mensual",
};

interface RecurringRow {
  id: string;
  title: string;
  freq: string;
  interval: number;
  endDate: string | null;
  occurrenceCount: number;
}

function RecurringPanel({ workspaceId }: { workspaceId: string }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<RecurringRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, recurrence_freq, recurrence_interval, recurrence_end_date")
        .eq("workspace_id", workspaceId)
        .not("recurrence_freq", "is", null)
        .is("recurrence_parent_id", null)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rootIds = (data ?? []).map((r) => r.id);
      let occurrenceMap: Record<string, number> = {};
      if (rootIds.length > 0) {
        const { data: children, error: childrenError } = await supabase
          .from("tasks")
          .select("recurrence_parent_id")
          .in("recurrence_parent_id", rootIds);
        if (childrenError) throw childrenError;
        occurrenceMap = (children ?? []).reduce<Record<string, number>>((acc, c) => {
          const pid = c.recurrence_parent_id;
          acc[pid] = (acc[pid] ?? 0) + 1;
          return acc;
        }, {});
      }

      setRows(
        (data ?? []).map((r) => ({
          id: r.id,
          title: r.title,
          freq: r.recurrence_freq,
          interval: r.recurrence_interval ?? 1,
          endDate: r.recurrence_end_date,
          occurrenceCount: occurrenceMap[r.id] ?? 0,
        })),
      );
    } catch (err) {
      console.error("[RecurringPanel] load error:", err);
      toast.error("Error al cargar tareas recurrentes");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDeleteSeries = async (row: RecurringRow) => {
    if (!confirm(`Eliminar la serie "${row.title}" y todas sus ocurrencias?`)) return;
    setDeleting(row.id);
    try {
      const { error: childrenError } = await supabase
        .from("tasks")
        .delete()
        .eq("recurrence_parent_id", row.id);
      if (childrenError) throw childrenError;
      const { error: rootError } = await supabase.from("tasks").delete().eq("id", row.id);
      if (rootError) throw rootError;
      await load();
      toast.success("Serie eliminada");
    } catch {
      toast.error("Error al eliminar la serie");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-ink">Plantillas recurrentes</p>
        <span className="rounded-full bg-surface-subtle px-2.5 py-0.5 text-[11px] font-bold text-ink-muted">
          {rows.length}
        </span>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-pritio-blue" />
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line py-6 text-center text-sm text-ink-muted">
          Sin tareas recurrentes todavía. Crea una tarea y elige una frecuencia de repetición.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{row.title}</p>
                <p className="text-[11px] font-semibold text-ink-muted">
                  {RECURRENCE_LABELS[row.freq] ?? row.freq}
                  {row.interval > 1 ? ` cada ${row.interval}` : ""}
                  {row.endDate ? ` · hasta ${row.endDate}` : ""}
                  {row.occurrenceCount > 0 ? ` · ${row.occurrenceCount} ocurrencia(s)` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleDeleteSeries(row)}
                disabled={deleting === row.id}
                aria-label="Eliminar serie"
                className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 12 12" fill="none">
                  <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ManageDialog({ workspaceId, workspaceName }: ManageDialogProps) {
  const { members, profile } = useWorkspace();
  const currentMember = members.find((m) => m.userId === profile?.id);
  const isOwner = currentMember?.role === "owner";
  const [activeTab, setActiveTab] = useState<ManageTab>("members");

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-subtle p-1">
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-bold transition-all",
                active
                  ? "bg-surface text-ink shadow-sm"
                  : "text-ink-muted hover:text-ink",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "members" && (
        <MembersPanel workspaceId={workspaceId} workspaceName={workspaceName} isOwner={isOwner} />
      )}
      {activeTab === "projects" && <ProjectsManager workspaceId={workspaceId} />}
      {activeTab === "recurring" && <RecurringPanel workspaceId={workspaceId} />}
    </div>
  );
}
