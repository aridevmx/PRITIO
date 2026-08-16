import { type FormEvent, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { PritioLogo } from "@/components/PritioLogo";
import { Field } from "@/components/Field";
import { cn } from "@/lib/utils";

export function ResetPasswordScreen() {
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [validating, setValidating] = useState(true);

  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.substring(1));
    const accessToken = params.get("access_token");

    if (!accessToken) {
      // En desktop el deep link `pritio://auth/reset` ya canjeó el código y la
      // sesión existe; aquí solo validamos que haya sesión.
      supabase.auth.getUser().then(({ data }) => {
        if (data.user) {
          setValidating(false);
        } else {
          setError("Enlace inválido o expirado. Solicita uno nuevo.");
          setValidating(false);
        }
      });
      return;
    }

    supabase.auth
      .setSession({
        access_token: accessToken,
        refresh_token: params.get("refresh_token") ?? "",
      })
      .then(({ error: sessionError }) => {
        if (sessionError) {
          setError("Enlace inválido o expirado. Solicita uno nuevo.");
        }
        setValidating(false);
      });
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }

    setSubmitting(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) throw updateError;
      setSuccess(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Error al actualizar la contraseña",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-muted px-4">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="panel p-8 text-center">
            <div className="mb-6 flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-pritio-green/10">
                <svg
                  className="h-8 w-8 text-pritio-green"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>
            </div>
            <h2 className="text-xl font-bold text-ink">
              Contraseña actualizada
            </h2>
            <p className="mt-2 text-sm text-ink-soft">
              Ya puedes iniciar sesión con tu nueva contraseña.
            </p>
            <button
              type="button"
              onClick={() => navigate("/")}
              className="mt-6 w-full rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-ink/90"
            >
              Ir al inicio de sesión
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-muted px-4">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="panel p-8">
          <div className="mb-8 flex flex-col items-center gap-3">
            <PritioLogo size={48} />
            <h1 className="text-xl font-bold text-ink">Nueva contraseña</h1>
            <p className="text-sm text-ink-soft">
              Ingresa tu nueva contraseña
            </p>
          </div>

          {validating ? (
            <div className="flex justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-line border-t-pritio-blue" />
            </div>
          ) : error && !newPassword ? (
            <div className="text-center">
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </p>
              <button
                type="button"
                onClick={() => navigate("/")}
                className="mt-4 w-full rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:bg-surface-muted"
              >
                Volver al inicio de sesión
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label="Nueva contraseña">
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  autoFocus
                  className="h-11 w-full rounded-xl border border-line bg-surface px-4 text-sm text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-pritio-blue focus:ring-2 focus:ring-pritio-blue/20"
                />
              </Field>

              <Field label="Confirmar contraseña">
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="h-11 w-full rounded-xl border border-line bg-surface px-4 text-sm text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-pritio-blue focus:ring-2 focus:ring-pritio-blue/20"
                />
              </Field>

              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className={cn(
                  "h-11 w-full rounded-xl text-sm font-semibold text-white transition-all",
                  "bg-ink hover:bg-ink/90 active:scale-[0.98]",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                )}
              >
                {submitting ? "Guardando..." : "Actualizar contraseña"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
