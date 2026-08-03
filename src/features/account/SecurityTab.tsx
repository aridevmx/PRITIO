import { useState, type FormEvent } from "react";
import { useAuth } from "@/features/auth/AuthProvider";
import { useToast } from "@/components/Toast";
import { inputClass } from "@/features/account/account-styles";

export function SecurityTab() {
  const { updatePassword } = useAuth();
  const { toast } = useToast();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres");
      return;
    }
    if (password !== confirm) {
      toast.error("Las contraseñas no coinciden");
      return;
    }
    setSaving(true);
    try {
      await updatePassword(password);
      toast.success("Contraseña actualizada");
      setPassword("");
      setConfirm("");
    } catch {
      toast.error(
        "No se pudo cambiar la contraseña. Inicia sesión de nuevo e inténtalo.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="mb-1 block text-xs font-medium text-ink-muted">Nueva contraseña</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mínimo 6 caracteres"
          autoComplete="new-password"
          className={inputClass}
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-ink-muted">Confirmar contraseña</label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Repite la contraseña"
          autoComplete="new-password"
          className={inputClass}
        />
      </div>

      <div className="flex justify-end pt-1">
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-ink px-5 py-2 text-sm font-semibold text-white hover:bg-ink/90 transition-colors disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Cambiar contraseña"}
        </button>
      </div>
    </form>
  );
}
