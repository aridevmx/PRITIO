import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { SegmentedControl } from "@/components/SegmentedControl";
import { supabase } from "@/lib/supabase";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import {
  updateWorkspace as apiUpdateWorkspace,
  deleteWorkspace as apiDeleteWorkspace,
  leaveWorkspace as apiLeaveWorkspace,
  setRecapSchedule as apiSetRecapSchedule,
  updateNotificationPreferences as apiUpdateNotificationPreferences,
  removeMember as apiRemoveMember,
} from "@/features/workspaces/api";
import { listInvitations, cancelInvitation } from "@/features/invitations/api";
import { InvitationModal } from "@/features/invitations/InvitationModal";
import { ProjectsManager } from "@/features/projects/ProjectsManager";
import { useToast } from "@/components/Toast";
import { getAppUrl } from "@/lib/appUrl";
import { useTimeFormat, setTimeFormat } from "@/lib/timeFormat";
import { useBilling } from "@/features/billing/BillingProvider";
import { parsePlanLimitError } from "@/features/billing/guarded";
import { openUpgrade } from "@/features/billing/upgrade";
import { PLAN_LABELS, PLAN_BADGE_CLASSES } from "@/features/billing/plans";
import type { Invitation, NotificationPreferences, WorkspaceRole } from "@/types";

const TYPE_LABELS: Record<string, string> = {
  personal: "Personal",
  family: "Familia",
  team: "Trabajo",
};

const TYPE_GRADIENTS: Record<string, string> = {
  personal: "from-purple-400 to-violet-600",
  family: "from-green-400 to-emerald-600",
  team: "from-blue-400 to-cyan-600",
};

interface WorkspaceSettingsModalProps {
  workspaceId: string;
  onClose: () => void;
}

type TabId = "general" | "notifications" | "members" | "advanced";

/** Switch row de settings — etiqueta a la izquierda, switch a la derecha. */
function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-3.5 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{label}</p>
        {description && <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={onChange}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pritio-blue/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
          checked ? "bg-pritio-blue" : "bg-line-strong hover:bg-ink-muted/40",
        )}
      >
        <span
          className={cn(
            "inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200",
            checked ? "translate-x-5" : "translate-x-0",
          )}
        />
      </button>
    </div>
  );
}

type MemberRow =
  | { kind: "active"; key: string; assigneeId: string; name: string; color: string; userId: string }
  | { kind: "inactive"; key: string; assigneeId: string; name: string; color: string }
  | { kind: "pending"; key: string; id: string; email: string; role: WorkspaceRole };

/**
 * Member manager for workspace settings.
 * Shows confirmed members (auto-synced as responsables), manual responsables
 * and pending invitations, each with a status chip.
 */
function MembersManager({
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
  const { profile, refresh: refreshWorkspace } = useWorkspace();
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<MemberRow | null>(null);
  const [reassignId, setReassignId] = useState("");
  const [removing, setRemoving] = useState(false);
  const [rolesByUserId, setRolesByUserId] = useState<Map<string, WorkspaceRole>>(new Map());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [assigneesRes, pendingList, membersRes] = await Promise.all([
        supabase
          .from("assignees")
          .select("id, name, color, linked_user_id")
          .eq("workspace_id", workspaceId),
        listInvitations(workspaceId),
        supabase
          .from("workspace_members")
          .select("user_id, role")
          .eq("workspace_id", workspaceId),
      ]);

      let assignees = assigneesRes.data ?? [];
      const pending: Invitation[] = (pendingList ?? []).filter((inv) => !inv.acceptedAt);

      /* Ensure every confirmed member has a responsable (assignee) linked */
      const memberRows = membersRes.data ?? [];
      const memberUserIds = new Set(
        memberRows.map((m: { user_id: string }) => m.user_id),
      );
      const rolesByUserId = new Map<string, WorkspaceRole>(
        memberRows.map((m: { user_id: string; role: WorkspaceRole }) => [m.user_id, m.role]),
      );
      const linkedUserIds = new Set(
        assignees.filter((a) => a.linked_user_id).map((a) => a.linked_user_id as string),
      );
      const missing = [...memberUserIds].filter((uid) => !linkedUserIds.has(uid));

      if (missing.length > 0) {
        for (const uid of missing) {
          await supabase.from("assignees").insert({
            workspace_id: workspaceId,
            name: "Miembro",
            color: "#" + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0"),
            linked_user_id: uid,
          });
        }
        const { data: refreshed } = await supabase
          .from("assignees")
          .select("id, name, color, linked_user_id")
          .eq("workspace_id", workspaceId);
        assignees = refreshed ?? [];
      }

      const nextRows: MemberRow[] = [];
      assignees.forEach((a) => {
        if (a.linked_user_id) {
          nextRows.push({
            kind: "active",
            key: `a-${a.id}`,
            assigneeId: a.id,
            name: a.name,
            color: a.color,
            userId: a.linked_user_id,
          });
        } else {
          nextRows.push({ kind: "inactive", key: `i-${a.id}`, assigneeId: a.id, name: a.name, color: a.color });
        }
      });
      pending.forEach((inv) => {
        nextRows.push({ kind: "pending", key: `p-${inv.id}`, id: inv.id, email: inv.email, role: inv.role });
      });
      setRows(nextRows);
      setRolesByUserId(rolesByUserId);
    } catch (err) {
      console.error("[MembersManager] load error:", err);
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

  const handleRemoveAssignee = async (id: string) => {
    try {
      const { error } = await supabase.from("assignees").delete().eq("id", id);
      if (error) throw error;
      await load();
      toast.success("Responsable eliminado");
    } catch {
      toast.error("Error al eliminar responsable");
    }
  };

  const handleRemoveMember = async () => {
    if (!removeTarget || removeTarget.kind !== "active") return;
    setRemoving(true);
    try {
      await apiRemoveMember(workspaceId, removeTarget.userId, reassignId || null);
      await load();
      await refreshWorkspace();
      toast.success("Miembro eliminado");
      setRemoveTarget(null);
      setReassignId("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al quitar miembro";
      toast.error(msg);
    } finally {
      setRemoving(false);
    }
  };

  const reassignOptions = rows.filter(
    (r): r is Extract<MemberRow, { kind: "active" }> =>
      r.kind === "active" &&
      removeTarget?.kind === "active" &&
      r.assigneeId !== removeTarget.assigneeId &&
      r.userId !== removeTarget.userId,
  );

  const handleCancelInvitation = async (id: string) => {
    try {
      await cancelInvitation(id);
      await load();
      toast.success("Invitación cancelada");
    } catch {
      toast.error("Error al cancelar invitación");
    }
  };

  const copyLink = (id: string) => {
    navigator.clipboard.writeText(`${getAppUrl()}/invitacion/${id}`).then(
      () => toast.success("Enlace copiado al portapapeles"),
      () => toast.error("No se pudo copiar el enlace"),
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-muted">Invitaciones</p>
        {isOwner ? (
          <button
            onClick={() => setInviteOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line py-3 text-sm font-semibold text-ink-muted hover:border-pritio-blue hover:text-pritio-blue transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
              <path d="M12 5.5C12 7.985 10 9 8 11C6 9 4 7.985 4 5.5C4 3.5 6 2 8 4C10 2 12 3.5 12 5.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
            Invitar miembros
          </button>
        ) : (
          <p className="text-sm text-ink-muted">Solo el owner puede invitar miembros.</p>
        )}
      </div>

      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-muted">
          Miembros ({rows.length})
        </p>
        {loading ? (
          <p className="text-sm text-ink-muted">Cargando...</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-ink-muted">Aún no hay miembros en este workspace.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line divide-y divide-line bg-surface-muted">
            {rows.map((row) => (
              <div key={row.key} className="flex items-center justify-between gap-2 px-3.5 py-2.5">
                {row.kind === "pending" ? (
                  <>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[11px] font-bold text-amber-700">
                        {row.email.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <span className="block truncate text-sm font-medium text-ink">{row.email}</span>
                        <span className="block text-xs text-ink-muted capitalize">{row.role}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                        No confirmado
                      </span>
                      <button
                        type="button"
                        onClick={() => copyLink(row.id)}
                        className="rounded-lg p-1 text-ink-muted hover:bg-pritio-blue/10 hover:text-pritio-blue transition-colors"
                        title="Copiar enlace de invitación"
                      >
                        <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
                          <path d="M6.5 9.5C7.5 10.5 8.5 10.5 9.5 9.5L12 7C13 6 13 4.5 12 3.5C11 2.5 9.5 2.5 8.5 3.5L7 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M9.5 6.5C8.5 5.5 7.5 5.5 6.5 6.5L4 9C3 10 3 11.5 4 12.5C5 13.5 6.5 13.5 7.5 12.5L9 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCancelInvitation(row.id)}
                        className="rounded-lg p-1 text-ink-muted hover:bg-red-50 hover:text-red-500 transition-colors"
                        title="Cancelar invitación"
                      >
                        <svg className="h-3.5 w-3.5" viewBox="0 0 12 12" fill="none">
                          <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: row.color }} />
                      <span className="truncate text-sm font-medium text-ink">{row.name}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {row.kind === "active" ? (
                        <>
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                            Activo
                          </span>
                          {isOwner && row.userId !== profile?.id && rolesByUserId.get(row.userId) !== "owner" && (
                            <button
                              type="button"
                              onClick={() => {
                                setReassignId("");
                                setRemoveTarget(row);
                              }}
                              className="rounded-lg p-1 text-ink-muted hover:bg-red-50 hover:text-red-500 transition-colors"
                              title="Quitar miembro"
                            >
                              <svg className="h-3.5 w-3.5" viewBox="0 0 12 12" fill="none">
                                <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                              </svg>
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-semibold text-ink-muted">
                            Inactivo
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveAssignee(row.assigneeId)}
                            className="rounded-lg p-1 text-ink-muted hover:bg-red-50 hover:text-red-500 transition-colors"
                            title="Eliminar responsable"
                          >
                            <svg className="h-3.5 w-3.5" viewBox="0 0 12 12" fill="none">
                              <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-muted">
          Agregar responsable manual
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
            placeholder="Nombre del responsable"
            className="flex-1 rounded-xl border border-line bg-surface-subtle px-3.5 py-2 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-pritio-blue focus:ring-1 focus:ring-pritio-blue/20"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={!newName.trim() || adding}
            className="rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-ink/90 transition-colors disabled:opacity-50"
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

      {removeTarget?.kind === "active" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-ink/30 backdrop-blur-sm"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setRemoveTarget(null);
            }}
          >
            <div className="pritio-modal-enter mx-4 w-full max-w-md rounded-2xl bg-surface p-6 shadow-elevated">
              <h3 className="text-lg font-bold text-ink">Quitar miembro</h3>
              <p className="mt-2 text-sm text-ink-soft">
                ¿Quitar a <span className="font-semibold text-ink">{removeTarget.name}</span> del workspace? Ya no podrá ver las tareas ni los días de este workspace.
              </p>

              <div className="mt-4">
                <label className="mb-1.5 block text-xs font-medium text-ink-muted">
                  Reasignar sus tareas a
                </label>
                <select
                  value={reassignId}
                  onChange={(e) => setReassignId(e.target.value)}
                  className="w-full rounded-xl border border-line bg-surface-subtle px-3.5 py-2 text-sm text-ink outline-none focus:border-pritio-blue focus:ring-1 focus:ring-pritio-blue/20"
                >
                  <option value="">Sin responsable</option>
                  {reassignOptions.map((r) => (
                    <option key={r.assigneeId} value={r.assigneeId}>{r.name}</option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-ink-muted">
                  Sus tareas asignadas pasarán al responsable elegido. El responsable queda como inactivo para conservar el historial.
                </p>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setRemoveTarget(null)}
                  className="rounded-xl border border-line px-4 py-2 text-sm font-semibold text-ink-soft hover:bg-surface-muted transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void handleRemoveMember()}
                  disabled={removing}
                  className="rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  {removing ? "Quitando..." : "Quitar miembro"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

export function WorkspaceSettingsModal({ workspaceId, onClose }: WorkspaceSettingsModalProps) {
  const { workspaces, currentWorkspace, members, profile, refresh: refreshWorkspace } = useWorkspace();
  const { effectivePlan } = useBilling();
  const { toast } = useToast();

  const ws = workspaces.find((w) => w.id === workspaceId);
  const memberCount = workspaceId === currentWorkspace?.id ? members.length : 0;
  const currentMember = members.find((m) => m.userId === profile?.id);
  const userIsOwner = currentMember?.role === "owner";
  const isPersonal = ws?.type === "personal";

  const [name, setName] = useState(ws?.name ?? "");
  const [autoPromote, setAutoPromote] = useState(ws?.autoPromoteDueToDo ?? false);
  const [recapEnabled, setRecapEnabled] = useState(false);
  const [morningTime, setMorningTime] = useState("08:00");
  const [eveningTime, setEveningTime] = useState("18:00");
  const [timezone, setTimezone] = useState("America/Mexico_City");
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>({
    email_task_assigned: true,
    email_meeting_created: true,
    email_deadline_approaching: true,
    email_daily_digest: true,
    push_task_assigned: true,
    push_meeting_created: true,
    push_deadline_approaching: true,
    push_task_due_soon: true,
  });
  const [saving, setSaving] = useState(false);
  const [savingNotifs, setSavingNotifs] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("general");
  const timeFormat = useTimeFormat();

  useEffect(() => {
    if (ws) {
      setName(ws.name);
      setAutoPromote(ws.autoPromoteDueToDo);
    }
  }, [ws]);

  useEffect(() => {
    if (currentMember) {
      setRecapEnabled(!!currentMember.recapMorningAt);
      setMorningTime(currentMember.recapMorningAt ?? "08:00");
      setEveningTime(currentMember.recapEveningAt ?? "18:00");
      setTimezone(currentMember.recapTimezone);
      if (currentMember.notificationPreferences) {
        setNotifPrefs(currentMember.notificationPreferences);
      }
    }
  }, [currentMember]);

  const tabs: { id: TabId; label: string }[] = [
    { id: "general", label: "General" },
    { id: "notifications", label: "Notificaciones" },
    ...(isPersonal ? [] : [{ id: "members" as const, label: "Miembros" }]),
    { id: "advanced", label: "Avanzado" },
  ];
  const tabIds = tabs.map((t) => t.id);
  const currentTab = tabs.some((t) => t.id === activeTab) ? activeTab : "general";
  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({
    general: null,
    notifications: null,
    members: null,
    advanced: null,
  });

  function handleTabKeyDown(e: React.KeyboardEvent) {
    const idx = tabIds.indexOf(currentTab);
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const dir = e.key === "ArrowRight" ? 1 : -1;
      const next = tabIds[(idx + dir + tabIds.length) % tabIds.length];
      setActiveTab(next);
      tabRefs.current[next]?.focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      const target = e.key === "Home" ? tabIds[0] : tabIds[tabIds.length - 1];
      setActiveTab(target);
      tabRefs.current[target]?.focus();
    }
  }

  const handleSaveGeneral = async () => {
    if (!ws) return;
    setSaving(true);
    try {
      await apiUpdateWorkspace(ws.id, { name: name.trim() || ws.name, autoPromoteDueToDo: autoPromote });
      await refreshWorkspace();
      toast.success("Configuracion guardada");
    } catch {
      toast.error("Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNotifications = async () => {
    if (!ws) return;
    setSavingNotifs(true);
    try {
      await apiUpdateNotificationPreferences(ws.id, notifPrefs);
      await apiSetRecapSchedule(
        ws.id,
        recapEnabled ? morningTime : null,
        recapEnabled ? eveningTime : null,
        timezone,
      );
      await refreshWorkspace();
      toast.success("Preferencias guardadas");
    } catch {
      toast.error("Error al guardar preferencias");
    } finally {
      setSavingNotifs(false);
    }
  };

  function toggleNotifPref(key: keyof NotificationPreferences) {
    setNotifPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const handleDelete = async () => {
    if (!ws || !userIsOwner) return;
    try {
      await apiDeleteWorkspace(ws.id);
      await refreshWorkspace();
      toast.success("Workspace eliminado");
      onClose();
    } catch {
      toast.error("Error al eliminar workspace");
    }
  };

  const handleLeave = async () => {
    if (!ws) return;
    try {
      await apiLeaveWorkspace(ws.id);
      await refreshWorkspace();
      toast.success("Has salido del workspace");
      onClose();
    } catch {
      toast.error("Error al salir del workspace");
    }
  };

  const inputClass =
    "w-full rounded-xl border border-line bg-surface-subtle px-3.5 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-pritio-blue focus:ring-1 focus:ring-pritio-blue/20";

  return (
    <>
      {createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-ink/30 backdrop-blur-sm"
          onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <div className="pritio-modal-enter mx-4 flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-elevated">
            {/* Header: identidad del workspace */}
            <div className="border-b border-line px-6 pt-5 pb-4">
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-lg font-bold text-white",
                    ws ? TYPE_GRADIENTS[ws.type] ?? "from-purple-400 to-violet-600" : "from-purple-400 to-violet-600",
                  )}
                >
                  {ws?.name?.charAt(0)?.toUpperCase() ?? "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-lg font-bold leading-snug text-ink">{ws?.name ?? "..."}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-surface-muted px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                      {ws ? TYPE_LABELS[ws.type] ?? ws.type : "..."}
                    </span>
                    {effectivePlan && (
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider",
                          PLAN_BADGE_CLASSES[effectivePlan],
                        )}
                      >
                        {PLAN_LABELS[effectivePlan]}
                      </span>
                    )}
                    {userIsOwner && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Owner</span>
                    )}
                    <span className="text-xs text-ink-muted">{memberCount} miembro{memberCount !== 1 ? "s" : ""}</span>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  aria-label="Cerrar configuración"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink transition-colors"
                >
                  <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                    <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="border-b border-line px-6 pt-3 pb-3">
              <div
                role="tablist"
                aria-label="Secciones de configuración"
                onKeyDown={handleTabKeyDown}
                className="flex gap-1 overflow-x-auto rounded-xl bg-surface-muted p-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    id={`ws-tab-${tab.id}`}
                    aria-selected={currentTab === tab.id}
                    aria-controls={`ws-panel-${tab.id}`}
                    tabIndex={currentTab === tab.id ? 0 : -1}
                    ref={(el) => { tabRefs.current[tab.id] = el; }}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pritio-blue/50",
                      currentTab === tab.id
                        ? "bg-white text-ink shadow-sm"
                        : "text-ink-muted hover:bg-surface hover:text-ink",
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Contenido por tab */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {currentTab === "general" && (
                <section
                  role="tabpanel"
                  id="ws-panel-general"
                  aria-labelledby="ws-tab-general"
                  className="space-y-7"
                >
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-ink-muted">Nombre</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div className="overflow-hidden rounded-xl border border-line divide-y divide-line bg-surface-muted">
                    <ToggleRow
                      label="Mover vencidas y de hoy a Haz ahora"
                      description="Auto-triage: las tareas vencidas y de hoy caen automáticamente en el cuadrante urgente"
                      checked={autoPromote}
                      onChange={() => setAutoPromote(!autoPromote)}
                    />
                  </div>

                  <div>
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-muted">Preferencias</p>
                    <div className="overflow-hidden rounded-xl border border-line divide-y divide-line bg-surface-muted">
                      <div className="px-3.5 py-3">
                        <p className="text-sm font-medium text-ink">Formato de hora</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
                          Se aplica a las horas de las juntas en toda la app.
                        </p>
                        <SegmentedControl
                          value={timeFormat}
                          onChange={(f) => setTimeFormat(f)}
                          options={[
                            { value: "24h", label: "24 h" },
                            { value: "12h", label: "12 h" },
                          ]}
                          className="mt-3"
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleSaveGeneral}
                    disabled={saving}
                    className="rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-ink/90 transition-colors disabled:opacity-50"
                  >
                    {saving ? "Guardando..." : "Guardar"}
                  </button>
                </section>
              )}

              {currentTab === "notifications" && (
                <section
                  role="tabpanel"
                  id="ws-panel-notifications"
                  aria-labelledby="ws-tab-notifications"
                  className="space-y-7"
                >
                  <div>
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-muted">Correo electrónico</p>
                    <div className="overflow-hidden rounded-xl border border-line divide-y divide-line bg-surface-muted">
                      <ToggleRow label="Tarea asignada" checked={notifPrefs.email_task_assigned} onChange={() => toggleNotifPref("email_task_assigned")} />
                      <ToggleRow label="Junta creada" checked={notifPrefs.email_meeting_created} onChange={() => toggleNotifPref("email_meeting_created")} />
                      <ToggleRow label="Fecha límite próxima" checked={notifPrefs.email_deadline_approaching} onChange={() => toggleNotifPref("email_deadline_approaching")} />
                      <ToggleRow label="Resumen diario" checked={notifPrefs.email_daily_digest} onChange={() => toggleNotifPref("email_daily_digest")} />
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-muted">Notificaciones push</p>
                    <div className="overflow-hidden rounded-xl border border-line divide-y divide-line bg-surface-muted">
                      <ToggleRow label="Tarea asignada" checked={notifPrefs.push_task_assigned} onChange={() => toggleNotifPref("push_task_assigned")} />
                      <ToggleRow label="Junta creada" checked={notifPrefs.push_meeting_created} onChange={() => toggleNotifPref("push_meeting_created")} />
                      <ToggleRow label="Fecha límite próxima" checked={notifPrefs.push_deadline_approaching} onChange={() => toggleNotifPref("push_deadline_approaching")} />
                      <ToggleRow label="Tarea por vencer" checked={notifPrefs.push_task_due_soon} onChange={() => toggleNotifPref("push_task_due_soon")} />
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-muted">Recuentos diarios</p>
                    <div className="overflow-hidden rounded-xl border border-line divide-y divide-line bg-surface-muted">
                      <ToggleRow
                        label="Activar recuentos"
                        description="Recibe un resumen de tus tareas por push por la mañana y por la tarde"
                        checked={recapEnabled}
                        onChange={() => setRecapEnabled(!recapEnabled)}
                      />
                      {recapEnabled && (
                        <div className="space-y-4 px-3.5 py-4">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="mb-1 block text-xs font-medium text-ink-muted">Matutino</label>
                              <input
                                type="time"
                                value={morningTime}
                                onChange={(e) => setMorningTime(e.target.value)}
                                className={inputClass}
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-ink-muted">Vespertino</label>
                              <input
                                type="time"
                                value={eveningTime}
                                onChange={(e) => setEveningTime(e.target.value)}
                                className={inputClass}
                              />
                            </div>
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-ink-muted">Zona horaria</label>
                            <select
                              value={timezone}
                              onChange={(e) => setTimezone(e.target.value)}
                              className={inputClass}
                            >
                              <option value="America/Mexico_City">America/Mexico City (UTC-6)</option>
                              <option value="America/New_York">America/New York (UTC-5)</option>
                              <option value="America/Los_Angeles">America/Los Angeles (UTC-8)</option>
                              <option value="America/Argentina/Buenos_Aires">America/Buenos Aires (UTC-3)</option>
                              <option value="Europe/Madrid">Europe/Madrid (UTC+1)</option>
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={handleSaveNotifications}
                    disabled={savingNotifs}
                    className="rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-ink/90 transition-colors disabled:opacity-50"
                  >
                    {savingNotifs ? "Guardando..." : "Guardar cambios"}
                  </button>
                </section>
              )}

              {currentTab === "members" && ws && ws.type !== "personal" && (
                <section
                  role="tabpanel"
                  id="ws-panel-members"
                  aria-labelledby="ws-tab-members"
                  className="space-y-7"
                >
                  <MembersManager workspaceId={ws.id} workspaceName={ws.name} isOwner={userIsOwner} />

                  <div>
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-muted">Proyectos</p>
                    <ProjectsManager workspaceId={ws.id} />
                  </div>
                </section>
              )}

              {currentTab === "advanced" && (
                <section
                  role="tabpanel"
                  id="ws-panel-advanced"
                  aria-labelledby="ws-tab-advanced"
                  className="space-y-3"
                >
                  <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Zona peligrosa</p>
                  <div className="rounded-xl border border-red-200 bg-red-50/50 p-4">
                    <h4 className="text-sm font-bold text-red-600">Acciones destructivas</h4>
                    {isPersonal ? (
                      <p className="mt-1 text-xs text-red-500">
                        No puedes salirte ni eliminar tu workspace personal.
                      </p>
                    ) : (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          onClick={handleLeave}
                          className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-100 transition-colors"
                        >
                          Salir del workspace
                        </button>
                        {userIsOwner && (
                          <button
                            onClick={handleDelete}
                            className="rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 transition-colors"
                          >
                            Eliminar workspace
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
