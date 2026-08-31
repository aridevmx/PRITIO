import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { exchangeAsanaCode } from "@/features/integrations/api";

/**
 * OAuth callback de Asana: recibe `code`, lo canjea por tokens vía Edge
 * Function y devuelve al usuario al pendiente.
 */
export function AsanaOAuthCallback() {
  const navigate = useNavigate();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    (async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");

      if (code) {
        await exchangeAsanaCode(code);
      }

      // Dispatcher un evento que cierra la ventana/popup si abrió Asana en popup.
      window.opener?.postMessage({ type: "pritio:asana-connected" }, window.location.origin);

      // Redirigir al usuario de vuelta a la app.
      const redirect = sessionStorage.getItem("pritio-asana-redirect") ?? "/pendiente";
      sessionStorage.removeItem("pritio-asana-redirect");
      navigate(redirect, { replace: true });
    })();
  }, [navigate]);

  return (
    <div className="flex h-full min-h-screen items-center justify-center bg-surface">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-pritio-blue" />
        <p className="text-sm text-ink-muted">Conectando con Asana…</p>
      </div>
    </div>
  );
}
