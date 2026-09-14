import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/components/Toast";
import { exchangeAsanaCode } from "@/features/integrations/api";

const STATE_KEY = "pritio-asana-oauth-state";
const REDIRECT_KEY = "pritio-asana-redirect";

/**
 * OAuth callback de Asana: recibe `code` y `state`, valida el nonce contra
 * sessionStorage (protección CSRF), canjea el código por tokens vía Edge
 * Function y devuelve al usuario al pendiente. Reporta errores por toast y
 * postMessage para que la pestaña que lanzó el popup lo refleje.
 */
export function AsanaOAuthCallback() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    (async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const state = params.get("state");
      const storedState = sessionStorage.getItem(STATE_KEY);
      sessionStorage.removeItem(STATE_KEY);

      const post = (type: string, detail?: unknown) =>
        window.opener?.postMessage(
          { type, detail: detail ?? undefined },
          window.location.origin,
        );

      if (code && storedState && state && state === storedState) {
        try {
          const result = await exchangeAsanaCode(code, state);
          if (result.ok) {
            toast.success("Conectado con Asana");
            post("pritio:asana-connected");
          } else {
            toast.error(result.error ?? "Error al conectar con Asana");
            post("pritio:asana-error", result.error ?? "Exchange failed");
          }
        } catch {
          toast.error("Error al conectar con Asana");
          post("pritio:asana-error", "unexpected");
        }
      } else if (code && storedState) {
        toast.error("La sesión de Asana no coincide — vuelve a intentarlo");
        post("pritio:asana-error", "state-mismatch");
      } else {
        toast.error("La sesión de Asana caducó — vuelve a conectarte");
        post("pritio:asana-error", "session-expired");
      }

      // Redirigir al usuario de vuelta a la app.
      const redirect = sessionStorage.getItem(REDIRECT_KEY) ?? "/pendiente";
      sessionStorage.removeItem(REDIRECT_KEY);
      navigate(redirect, { replace: true });
    })();
  }, [navigate, toast]);

  return (
    <div className="flex h-full min-h-screen items-center justify-center bg-surface">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-pritio-blue" />
        <p className="text-sm text-ink-muted">Conectando con Asana…</p>
      </div>
    </div>
  );
}