import { useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { upsertProfile } from "@/features/auth/api";
import { useAuth } from "@/features/auth/AuthProvider";
import { useToast } from "@/components/Toast";

interface ProfileEditModalProps {
  onClose: () => void;
}

export function ProfileEditModal({ onClose }: ProfileEditModalProps) {
  const { profile, refreshProfile } = useAuth();
  const { toast } = useToast();

  const [fullName, setFullName] = useState(profile?.fullName ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatarUrl ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    try {
      await upsertProfile(profile.id, {
        full_name: fullName.trim() || profile.fullName,
        avatar_url: avatarUrl.trim() || null,
      });
      await refreshProfile();
      toast.success("Perfil actualizado");
      onClose();
    } catch {
      toast.error("Error al guardar el perfil");
    } finally {
      setSaving(false);
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
          <h3 className="text-lg font-bold text-ink">Editar perfil</h3>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSave} className="px-6 py-5 space-y-5">
          {/* Avatar preview */}
          <div className="flex justify-center">
            <div className="relative">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt=""
                  className="h-16 w-16 rounded-full object-cover border-2 border-line"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                    const fallback = (e.target as HTMLImageElement).nextElementSibling;
                    if (fallback) (fallback as HTMLElement).style.display = "flex";
                  }}
                />
              ) : null}
              <div
                className={`h-16 w-16 rounded-full bg-prio-purple items-center justify-center text-xl font-bold text-white ${
                  avatarUrl ? "hidden" : "flex"
                }`}
              >
                {(fullName || profile?.fullName || profile?.email || "?").charAt(0).toUpperCase()}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">
              Nombre completo
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Tu nombre"
              className="w-full rounded-xl border border-line bg-surface-subtle px-3.5 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-prio-blue focus:ring-1 focus:ring-prio-blue/20"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">
              Correo electrónico
            </label>
            <input
              type="email"
              value={profile?.email ?? ""}
              disabled
              className="w-full rounded-xl border border-line bg-surface-muted px-3.5 py-2 text-sm text-ink-muted outline-none cursor-not-allowed"
            />
            <p className="mt-1 text-[10px] text-ink-muted">
              El correo no se puede cambiar
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">
              Avatar (URL)
            </label>
            <input
              type="url"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://ejemplo.com/avatar.png"
              className="w-full rounded-xl border border-line bg-surface-subtle px-3.5 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-prio-blue focus:ring-1 focus:ring-prio-blue/20"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-line px-4 py-2.5 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-muted"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-ink/90 transition-colors disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
