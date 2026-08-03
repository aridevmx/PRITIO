import { type FormEvent, useState } from "react";
import { useAuth } from "@/features/auth/AuthProvider";
import { PrioLogo } from "@/components/PrioLogo";
import { Field } from "@/components/Field";
import { cn } from "@/lib/utils";
import { checkEmailHasInvitation } from "@/features/invitations/api";

const BETA_MODE = import.meta.env.VITE_BETA_MODE === "true";

type AuthMode = "login" | "signup" | "forgot" | "magic";

export function AuthScreen() {
  const { signIn, signUp, signInWithMagicLink, resetPassword, loading } =
    useAuth();

  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sentEmail, setSentEmail] = useState(false);

  const isSignup = mode === "signup";
  const isForgot = mode === "forgot";
  const isMagic = mode === "magic";
  const isLogin = mode === "login";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (isSignup) {
        if (BETA_MODE) {
          const hasInvite = await checkEmailHasInvitation(email);
          if (!hasInvite) {
            throw new Error(
              "Esta versión está en beta cerrada. Necesitas una invitación para registrarte. Solicita una invitación con el equipo de Prio.",
            );
          }
        }
        const result = await signUp(email, password, fullName);
        if (result.needsConfirmation) {
          setSentEmail(true);
        }
      } else if (isForgot) {
        await resetPassword(email);
        setSentEmail(true);
      } else if (isMagic) {
        await signInWithMagicLink(email);
        setSentEmail(true);
      } else {
        await signIn(email, password);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Ocurrió un error inesperado. Intenta de nuevo.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function goTo(mode: AuthMode) {
    setMode(mode);
    setError(null);
    setSentEmail(false);
  }

  if (sentEmail) {
    const isResetFlow = isForgot;

    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-muted px-4">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="panel p-8 text-center">
            <div className="mb-6 flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-prio-green/10">
                <svg
                  className="h-8 w-8 text-prio-green"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="M22 7l-10 6L2 7" />
                </svg>
              </div>
            </div>
            <h2 className="text-xl font-bold text-ink">
              {isMagic
                ? "Revisa tu correo"
                : isResetFlow
                  ? "Correo enviado"
                  : "Revisa tu correo"}
            </h2>
            <p className="mt-2 text-sm text-ink-soft">
              {isMagic ? (
                <>
                  Te enviamos un enlace de acceso a{" "}
                  <span className="font-medium text-ink">{email}</span>. Haz
                  clic en el enlace para iniciar sesión.
                </>
              ) : isResetFlow ? (
                <>
                  Te enviamos un enlace para restablecer tu contraseña a{" "}
                  <span className="font-medium text-ink">{email}</span>. Haz
                  clic en el enlace para continuar.
                </>
              ) : (
                <>
                  Te enviamos un enlace de confirmación a{" "}
                  <span className="font-medium text-ink">{email}</span>. Haz
                  clic en el enlace para activar tu cuenta.
                </>
              )}
            </p>
            <button
              type="button"
              onClick={() => goTo("login")}
              className="mt-6 w-full rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:bg-surface-muted"
            >
              Volver al inicio de sesión
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
            <PrioLogo size={48} />
            <h1 className="text-xl font-bold text-ink">
              {isSignup
                ? "Crear cuenta"
                : isForgot
                  ? "Recuperar contraseña"
                  : isMagic
                    ? "Acceso por correo"
                    : "Iniciar sesión"}
            </h1>
            <p className="text-sm text-ink-soft">
              {isSignup
                ? "Organiza tu tiempo con estilo"
                : isForgot
                  ? "Ingresa tu correo para restablecer tu contraseña"
                  : isMagic
                    ? "Te enviaremos un enlace para entrar sin contraseña"
                    : "Bienvenido de vuelta"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignup && (
              <Field label="Nombre completo">
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Tu nombre"
                  required
                  className="h-11 w-full rounded-xl border border-line bg-surface px-4 text-sm text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-prio-blue focus:ring-2 focus:ring-prio-blue/20"
                />
              </Field>
            )}

            <Field label="Correo electrónico">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                required
                autoComplete="email"
                className="h-11 w-full rounded-xl border border-line bg-surface px-4 text-sm text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-prio-blue focus:ring-2 focus:ring-prio-blue/20"
              />
            </Field>

            {!isForgot && !isMagic && (
              <Field label="Contraseña">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  autoComplete={
                    isSignup ? "new-password" : "current-password"
                  }
                  className="h-11 w-full rounded-xl border border-line bg-surface px-4 text-sm text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-prio-blue focus:ring-2 focus:ring-prio-blue/20"
                />
              </Field>
            )}

            {isLogin && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => goTo("forgot")}
                  className="text-xs font-medium text-prio-blue hover:underline"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
            )}

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || loading}
              className={cn(
                "h-11 w-full rounded-xl text-sm font-semibold text-white transition-all",
                "bg-ink hover:bg-ink/90 active:scale-[0.98]",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              {submitting
                ? "Cargando..."
                : isSignup
                  ? "Crear cuenta"
                  : isForgot
                    ? "Enviar enlace"
                    : isMagic
                      ? "Enviar enlace mágico"
                      : "Iniciar sesión"}
            </button>
          </form>

          {!isForgot && (
            <div className="mt-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-line" />
              <span className="text-xs text-ink-muted">o</span>
              <div className="h-px flex-1 bg-line" />
            </div>
          )}

          {!isForgot && !isMagic && (
            <button
              type="button"
              onClick={() => goTo("magic")}
              className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface text-sm font-medium text-ink-soft transition-colors hover:bg-surface-muted"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <rect x="1.5" y="3.5" width="13" height="9" rx="1.5" />
                <path d="M1.5 5.5L8 9.5L14.5 5.5" />
              </svg>
              Entrar con enlace mágico
            </button>
          )}

          {isMagic && (
            <button
              type="button"
              onClick={() => goTo("login")}
              className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface text-sm font-medium text-ink-soft transition-colors hover:bg-surface-muted"
            >
              Volver a contraseña
            </button>
          )}

            {isLogin && BETA_MODE && (
              <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-700">
                <span className="font-semibold">Beta cerrada.</span> Solo puedes acceder si recibiste una invitación por correo.
              </div>
            )}

            <div className="mt-6 text-center">
            {isSignup || isForgot || isMagic ? (
              <button
                type="button"
                onClick={() => goTo("login")}
                className="text-sm text-ink-soft transition-colors hover:text-ink"
              >
                ¿Ya tienes cuenta? Inicia sesión
              </button>
            ) : (
              <button
                type="button"
                onClick={() => goTo("signup")}
                className="text-sm text-ink-soft transition-colors hover:text-ink"
              >
                ¿No tienes cuenta? Créala
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


