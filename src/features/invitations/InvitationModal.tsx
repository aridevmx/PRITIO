import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { createInvitation, sendInvitationEmail } from "@/features/invitations/api";
import { useToast } from "@/components/Toast";
import { useBilling } from "@/features/billing/BillingProvider";
import { parsePlanLimitError } from "@/features/billing/guarded";
import { openUpgrade } from "@/features/billing/upgrade";
import { MEMBER_TYPE_LABELS } from "@/lib/constants";
import { supabase } from "@/lib/supabase";
import type { MemberType, WorkspaceRole, WorkspaceType } from "@/types";

interface InvitationModalProps {
  workspaceId: string;
  workspaceName: string;
  onClose: () => void;
  onSent?: () => void;
}

export function InvitationModal({ workspaceId, workspaceName, onClose, onSent }: InvitationModalProps) {
  const { toast } = useToast();
  const { canCreate } = useBilling();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("member");
  const [memberType, setMemberType] = useState<MemberType | null>(null);
  const [workspaceType, setWorkspaceType] = useState<WorkspaceType | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("workspaces")
        .select("type")
        .eq("id", workspaceId)
        .single();
      if (active && data) setWorkspaceType((data as { type: WorkspaceType }).type);
    })().catch(() => {});
    return () => {
      active = false;
    };
  }, [workspaceId]);

  const isFamily = workspaceType === "family";

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    if (!canCreate("members")) return;
    setSending(true);
    try {
      const inv = await createInvitation(workspaceId, email.trim(), role, memberType);
      setEmail("");

      const sent = await sendInvitationEmail(inv.id);
      if (sent) {
        toast.success("Invitación enviada por correo");
      } else {
        toast.success("Invitación creada. Comparte el enlace manualmente.");
      }

      onSent?.();
      onClose();
    } catch (err) {
      const resource = parsePlanLimitError(err);
      if (resource) {
        openUpgrade(resource);
        return;
      }
      toast.error(
        err instanceof Error ? err.message : "Error al enviar invitación",
      );
    } finally {
      setSending(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-ink/30 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="pritio-modal-enter mx-4 w-full max-w-md rounded-2xl border border-line bg-surface p-0 shadow-elevated overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h3 className="text-lg font-bold text-ink">Invitar a {workspaceName}</h3>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSend} className="space-y-4 px-6 py-5">
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">
              Correo electrónico
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="correo@ejemplo.com"
              required
              autoFocus
              className="w-full rounded-xl border border-line bg-surface-subtle px-3.5 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-pritio-blue focus:ring-1 focus:ring-pritio-blue/20"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">
              Rol
            </label>
            <div className="flex gap-2">
              {(["member", "leader", "admin"] as WorkspaceRole[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition-all ${
                    role === r
                      ? "border-pritio-blue bg-pritio-blue/10 text-pritio-blue shadow-sm"
                      : "border-line text-ink-muted hover:bg-surface-muted"
                  }`}
                >
                  {r === "member" ? "Miembro" : r === "leader" ? "Líder" : "Admin"}
                </button>
              ))}
            </div>
          </div>

          {isFamily && (
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">
                Parentesco
              </label>
              <select
                value={memberType ?? ""}
                onChange={(e) => setMemberType((e.target.value || null) as MemberType | null)}
                className="w-full rounded-xl border border-line bg-surface-subtle px-3.5 py-2 text-sm text-ink outline-none transition-colors focus:border-pritio-blue focus:ring-1 focus:ring-pritio-blue/20"
              >
                <option value="">Selecciona…</option>
                {Object.entries(MEMBER_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-line px-4 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-muted"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!email.trim() || sending}
              className="flex-1 rounded-xl bg-pritio-blue px-4 py-2 text-sm font-semibold text-white hover:bg-pritio-blue/90 transition-colors disabled:opacity-50"
            >
              {sending ? "Enviando..." : "Enviar invitación"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
