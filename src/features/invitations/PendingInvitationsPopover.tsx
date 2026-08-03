import { useCallback, useEffect, useRef, useState } from "react";
import { listMyPendingInvitations, acceptInvitation, rejectInvitation } from "@/features/invitations/api";
import { useToast } from "@/components/Toast";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import { formatRelativeTime } from "@/features/tasks/dates";
import { supabase } from "@/lib/supabase";
import type { Invitation } from "@/types";

export function PendingInvitationsPopover() {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [workspaceNames, setWorkspaceNames] = useState<Record<string, string>>({});
  const [senderNames, setSenderNames] = useState<Record<string, string>>({});
  const panelRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { refresh } = useWorkspace();

  const fetchInvitations = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listMyPendingInvitations();
      setInvitations(data);

      const wsIds = [...new Set(data.map((i) => i.workspaceId))];
      const senderIds = [...new Set(data.map((i) => i.invitedBy))];

      if (wsIds.length > 0) {
        const { data: wsData } = await supabase
          .from("workspaces")
          .select("id, name")
          .in("id", wsIds);
        const map: Record<string, string> = {};
        (wsData ?? []).forEach((w: { id: string; name: string }) => { map[w.id] = w.name; });
        setWorkspaceNames(map);
      }

      if (senderIds.length > 0) {
        const { data: profData } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", senderIds);
        const map: Record<string, string> = {};
        (profData ?? []).forEach((p: { id: string; full_name: string }) => { map[p.id] = p.full_name; });
        setSenderNames(map);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchInvitations();
  }, [fetchInvitations]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  async function handleAccept(inv: Invitation) {
    setProcessing(inv.id);
    try {
      await acceptInvitation(inv);
      toast.success(`Te uniste a ${workspaceNames[inv.workspaceId] ?? "un workspace"}`);
      setInvitations((prev) => prev.filter((i) => i.id !== inv.id));
      await refresh();
    } catch {
      toast.error("Error al aceptar invitación");
    } finally {
      setProcessing(null);
    }
  }

  async function handleReject(invId: string) {
    setProcessing(invId);
    try {
      await rejectInvitation(invId);
      toast.success("Invitación rechazada");
      setInvitations((prev) => prev.filter((i) => i.id !== invId));
    } catch {
      toast.error("Error al rechazar invitación");
    } finally {
      setProcessing(null);
    }
  }

  if (invitations.length === 0 && !isOpen) return null;

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative rounded-lg p-1.5 text-ink-soft hover:bg-surface-muted"
        title="Invitaciones pendientes"
      >
        <svg className="h-5 w-5" viewBox="0 0 16 16" fill="none">
          <path d="M12 5.5C12 7.985 10 9 8 11C6 9 4 7.985 4 5.5C4 3.5 6 2 8 4C10 2 12 3.5 12 5.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
        {invitations.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
            {invitations.length > 9 ? "9+" : invitations.length}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-2xl border border-line bg-surface shadow-elevated">
          <div className="border-b border-line px-4 py-3">
            <h3 className="text-sm font-bold text-ink">Invitaciones pendientes</h3>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="py-8 text-center text-sm text-ink-muted">Cargando...</div>
            ) : invitations.length === 0 ? (
              <div className="py-8 text-center text-sm text-ink-muted">
                Sin invitaciones pendientes
              </div>
            ) : (
              invitations.map((inv) => (
                <div
                  key={inv.id}
                  className="border-b border-line px-4 py-3 last:border-0"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">
                        {workspaceNames[inv.workspaceId] ?? "Cargando..."}
                      </p>
                      <p className="text-xs text-ink-muted mt-0.5">
                        {senderNames[inv.invitedBy] ?? "Alguien"} te invitó como{" "}
                        <span className="font-medium capitalize">{inv.role}</span>
                      </p>
                      <p className="text-[10px] text-ink-muted mt-1">
                        {formatRelativeTime(inv.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => handleAccept(inv)}
                      disabled={processing === inv.id}
                      className="flex-1 rounded-lg bg-prio-blue py-1.5 text-xs font-semibold text-white hover:bg-prio-blue/90 transition-colors disabled:opacity-50"
                    >
                      {processing === inv.id ? "..." : "Aceptar"}
                    </button>
                    <button
                      onClick={() => handleReject(inv.id)}
                      disabled={processing === inv.id}
                      className="flex-1 rounded-lg border border-line py-1.5 text-xs font-medium text-ink-muted hover:bg-surface-muted transition-colors disabled:opacity-50"
                    >
                      Rechazar
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
