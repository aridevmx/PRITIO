import { useCallback, useEffect, useState } from "react";
import {
  listDocCollaborators,
  addDocCollaborator,
  updateDocCollaboratorRole,
  removeDocCollaborator,
  type DocCollaborator,
} from "@/features/docs/api";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";

interface ShareDialogProps {
  open: boolean;
  docId: string;
  docTitle: string;
  visibility: "workspace" | "restricted";
  /** Creador del doc o admin del workspace. */
  canManage: boolean;
  onVisibilityChange: (v: "workspace" | "restricted") => void;
  onClose: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ShareDialog({
  open,
  docId,
  docTitle,
  visibility,
  canManage,
  onVisibilityChange,
  onClose,
}: ShareDialogProps) {
  const { toast } = useToast();
  const { profile } = useWorkspace();

  const [collaborators, setCollaborators] = useState<DocCollaborator[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<DocCollaborator["role"]>("viewer");
  const [adding, setAdding] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<DocCollaborator | null>(null);

  useEffect(() => {
    if (!open || !docId) return;
    let cancelled = false;
    setIsLoading(true);
    void listDocCollaborators(docId)
      .then((rows) => {
        if (!cancelled) setCollaborators(rows);
      })
      .catch(() => {
        if (!cancelled) toast.error("No se pudieron cargar los colaboradores");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, docId, toast]);

  const handleAdd = useCallback(async () => {
    const clean = email.trim().toLowerCase();
    if (!EMAIL_RE.test(clean)) {
      toast.error("Escribe un correo válido");
      return;
    }
    if (clean === profile?.email?.toLowerCase()) {
      toast.error("Ya tienes acceso a este documento");
      return;
    }
    setAdding(true);
    try {
      const created = await addDocCollaborator(docId, clean, role, true);
      setCollaborators((prev) =>
        prev.some((c) => c.id === created.id) ? prev : [...prev, created],
      );
      setEmail("");
      toast.success(`Invitación enviada a ${clean}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("duplicate") || msg.includes("unique")) {
        toast.error("Esa persona ya es colaboradora del documento");
      } else {
        toast.error("No se pudo agregar el colaborador");
      }
    } finally {
      setAdding(false);
    }
  }, [email, role, docId, profile, toast]);

  const handleRoleChange = async (c: DocCollaborator, next: DocCollaborator["role"]) => {
    const before = c.role;
    setCollaborators((prev) => prev.map((x) => (x.id === c.id ? { ...x, role: next } : x)));
    try {
      await updateDocCollaboratorRole(c.id, next);
    } catch {
      setCollaborators((prev) => prev.map((x) => (x.id === c.id ? { ...x, role: before } : x)));
      toast.error("No se pudo cambiar el permiso");
    }
  };

  const handleRemove = async () => {
    if (!pendingRemove) return;
    const doomed = pendingRemove;
    setPendingRemove(null);
    try {
      await removeDocCollaborator(doomed.id);
      setCollaborators((prev) => prev.filter((c) => c.id !== doomed.id));
      toast.success("Colaborador eliminado");
    } catch {
      toast.error("No se pudo eliminar al colaborador");
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-end justify-center bg-ink/30 backdrop-blur-sm md:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="pritio-modal-enter flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-elevated md:max-w-lg md:rounded-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-ink">Compartir documento</h2>
            <p className="truncate text-xs text-ink-muted">{docTitle || "Sin título"}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted hover:bg-surface-muted"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* Visibilidad */}
          <section>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-muted">Acceso</p>
            <div className="space-y-2">
              {(
                [
                  {
                    value: "workspace" as const,
                    label: "Todo el workspace",
                    hint: "Todos los miembros pueden ver y editar",
                  },
                  {
                    value: "restricted" as const,
                    label: "Restringido",
                    hint: "Solo tú, admins y colaboradores invitados",
                  },
                ]
              ).map((opt) => (
                <label
                  key={opt.value}
                  className={
                    "flex cursor-pointer items-start gap-2.5 rounded-xl border px-3.5 py-2.5 transition-colors " +
                    (visibility === opt.value
                      ? "border-pritio-blue bg-pritio-blue/5"
                      : "border-line hover:border-line-strong")
                  }
                >
                  <input
                    type="radio"
                    name="doc-visibility"
                    checked={visibility === opt.value}
                    onChange={() => onVisibilityChange(opt.value)}
                    className="mt-0.5 accent-pritio-blue"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-ink">{opt.label}</span>
                    <span className="block text-xs text-ink-soft">{opt.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          {/* Colaboradores */}
          <section>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-muted">
              Colaboradores invitados
            </p>

            {isLoading ? (
              <p className="text-xs text-ink-muted">Cargando…</p>
            ) : collaborators.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line-strong/60 px-3 py-3 text-center text-xs leading-relaxed text-ink-muted">
                Aún no hay colaboradores externos. Invita por correo abajo; si la persona no tiene
                cuenta, podrá acceder al aceptar su invitación.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {collaborators.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center gap-2 rounded-xl border border-line bg-surface-subtle px-3 py-2"
                  >
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-muted text-[10px] font-bold text-ink-soft">
                      {c.email.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">{c.email}</span>
                    <select
                      value={c.role}
                      onChange={(e) => void handleRoleChange(c, e.target.value as DocCollaborator["role"])}
                      aria-label={`Permiso de ${c.email}`}
                      className="shrink-0 rounded-lg border border-line bg-surface px-1.5 py-1 text-xs font-medium text-ink focus:border-pritio-blue focus:outline-none"
                    >
                      <option value="viewer">Puede ver</option>
                      <option value="editor">Puede editar</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setPendingRemove(c)}
                      aria-label={`Eliminar a ${c.email}`}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-muted transition-colors hover:bg-pritio-coral/10 hover:text-pritio-coral"
                    >
                      <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
                        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Invitar */}
          <section>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-muted">
              Invitar por correo
            </p>
            <div className="flex items-center gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleAdd();
                  }
                }}
                placeholder="correo@ejemplo.com"
                aria-label="Correo del colaborador"
                disabled={!canManage}
                className="min-w-0 flex-1 rounded-xl border border-line bg-surface-subtle px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-pritio-blue focus:outline-none focus:ring-2 focus:ring-pritio-blue/20 disabled:opacity-60"
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as DocCollaborator["role"])}
                aria-label="Permiso para el nuevo colaborador"
                disabled={!canManage}
                className="shrink-0 rounded-xl border border-line bg-surface px-2 py-2 text-xs font-medium text-ink focus:border-pritio-blue focus:outline-none disabled:opacity-60"
              >
                <option value="viewer">Puede ver</option>
                <option value="editor">Puede editar</option>
              </select>
              <button
                type="button"
                onClick={() => void handleAdd()}
                disabled={adding || !canManage}
                className="shrink-0 rounded-xl bg-ink px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-ink/90 disabled:opacity-50"
              >
                Invitar
              </button>
            </div>
          </section>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(pendingRemove)}
        onClose={() => setPendingRemove(null)}
        onConfirm={() => void handleRemove()}
        title="Eliminar colaborador"
        description={`Se quitará el acceso de ${pendingRemove?.email ?? ""} a este documento.`}
        confirmLabel="Quitar acceso"
        variant="danger"
      />
    </div>
  );
}
