import { useState } from "react";
import { createPortal } from "react-dom";
import { createInvitation, sendInvitationEmail } from "@/features/invitations/api";
import { useToast } from "@/components/Toast";
import type { WorkspaceRole } from "@/types";

interface InvitationModalProps {
  workspaceId: string;
  workspaceName: string;
  onClose: () => void;
  onSent?: () => void;
}

export function InvitationModal({ workspaceId, workspaceName, onClose, onSent }: InvitationModalProps) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("member");
  const [sending, setSending] = useState(false);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    try {
      const inv = await createInvitation(workspaceId, email.trim(), role);
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
      <div className="prio-modal-enter mx-4 w-full max-w-md rounded-2xl border border-line bg-surface p-0 shadow-elevated overflow-hidden">
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
              className="w-full rounded-xl border border-line bg-surface-subtle px-3.5 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-prio-blue focus:ring-1 focus:ring-prio-blue/20"
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
                      ? "border-prio-blue bg-prio-blue/10 text-prio-blue shadow-sm"
                      : "border-line text-ink-muted hover:bg-surface-muted"
                  }`}
                >
                  {r === "member" ? "Miembro" : r === "leader" ? "Líder" : "Admin"}
                </button>
              ))}
            </div>
          </div>

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
              className="flex-1 rounded-xl bg-prio-blue px-4 py-2 text-sm font-semibold text-white hover:bg-prio-blue/90 transition-colors disabled:opacity-50"
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
