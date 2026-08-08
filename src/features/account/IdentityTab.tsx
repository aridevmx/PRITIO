import { useState, type FormEvent } from "react";
import { upsertProfile } from "@/features/auth/api";
import { useAuth } from "@/features/auth/AuthProvider";
import { useToast } from "@/components/Toast";
import { inputClass, disabledInputClass } from "@/features/account/account-styles";

export function IdentityTab() {
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
    } catch {
      toast.error("Error al guardar el perfil");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="flex justify-center">
        <div className="relative">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="h-20 w-20 rounded-full object-cover border-2 border-line"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
                const fallback = (e.target as HTMLImageElement).nextElementSibling;
                if (fallback) (fallback as HTMLElement).style.display = "flex";
              }}
            />
          ) : null}
          <div
            className={`h-20 w-20 rounded-full bg-pritio-purple items-center justify-center text-2xl font-bold text-white ${
              avatarUrl ? "hidden" : "flex"
            }`}
          >
            {(fullName || profile?.fullName || profile?.email || "?").charAt(0).toUpperCase()}
          </div>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-ink-muted">Nombre completo</label>
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Tu nombre"
          className={inputClass}
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-ink-muted">Correo electrónico</label>
        <input type="email" value={profile?.email ?? ""} disabled className={disabledInputClass} />
        <p className="mt-1 text-[10px] text-ink-muted">El correo no se puede cambiar</p>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-ink-muted">Foto de perfil (URL)</label>
        <input
          type="url"
          value={avatarUrl}
          onChange={(e) => setAvatarUrl(e.target.value)}
          placeholder="https://ejemplo.com/avatar.png"
          className={inputClass}
        />
        <p className="mt-1 text-[10px] text-ink-muted">
          Pega la URL de una imagen. La subida directa llegará más adelante.
        </p>
      </div>

      <div className="flex justify-end pt-1">
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-ink px-5 py-2 text-sm font-semibold text-white hover:bg-ink/90 transition-colors disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}
