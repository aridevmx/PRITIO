import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { acceptInvitation } from "@/features/invitations/api";
import { PritioLogo } from "@/components/PritioLogo";
import type { Invitation, MemberType, WorkspaceRole } from "@/types";

type JoinState = "loading" | "not_authenticated" | "not_found" | "accepted" | "error";

export function JoinScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<JoinState>("loading");
  const [workspaceName, setWorkspaceName] = useState("");

  useEffect(() => {
    if (!id) {
      setState("not_found");
      return;
    }
    const invitationId: string = id;

    async function process() {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.user) {
        localStorage.setItem("pritio-pending-invitation", invitationId);
        setState("not_authenticated");
        return;
      }

      try {
        const { data: inv } = await supabase
          .from("invitations")
          .select("id, workspace_id, accepted_at, role, member_type")
          .eq("id", id)
          .maybeSingle();

        if (!inv) {
          setState("not_found");
          return;
        }

        if (inv.accepted_at) {
          setState("accepted");
          return;
        }

        const { data: ws } = await supabase
          .from("workspaces")
          .select("name")
          .eq("id", inv.workspace_id)
          .single();

        setWorkspaceName((ws as { name: string } | null)?.name ?? "");

        const { data: existing } = await supabase
          .from("workspace_members")
          .select("id")
          .eq("workspace_id", inv.workspace_id)
          .eq("user_id", session.user.id)
          .maybeSingle();

        if (existing) {
          setState("accepted");
          return;
        }

        await acceptInvitation({
          id: inv.id,
          workspaceId: inv.workspace_id,
          email: "",
          role: inv.role as WorkspaceRole,
          memberType: inv.member_type as MemberType | null,
          invitedBy: "",
          acceptedAt: null,
          createdAt: "",
        } as Invitation);

        setState("accepted");
      } catch {
        setState("error");
      }
    }

    void process();
  }, [id]);

  if (state === "not_authenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-muted px-4">
        <div className="w-full max-w-sm text-center">
          <div className="panel p-8">
            <div className="mb-6 flex justify-center">
              <PritioLogo size={48} />
            </div>
            <h2 className="text-xl font-bold text-ink">Invitación recibida</h2>
            <p className="mt-2 text-sm text-ink-soft">
              Inicia sesión o crea una cuenta para aceptar la invitación.
            </p>
            <button
              onClick={() => navigate("/", { replace: true })}
              className="mt-6 w-full rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-ink/90 transition-colors"
            >
              Iniciar sesión
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-muted px-4">
      <div className="w-full max-w-sm text-center">
        <div className="panel p-8">
          <div className="mb-6 flex justify-center">
            <PritioLogo size={48} />
          </div>

          {state === "loading" && (
            <>
              <h2 className="text-xl font-bold text-ink">Procesando invitación...</h2>
              <p className="mt-2 text-sm text-ink-soft">Solo un momento</p>
            </>
          )}

          {state === "not_found" && (
            <>
              <h2 className="text-xl font-bold text-ink">Invitación no encontrada</h2>
              <p className="mt-2 text-sm text-ink-soft">
                Esta invitación no existe o ya fue cancelada.
              </p>
              <button
                onClick={() => navigate("/", { replace: true })}
                className="mt-6 w-full rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-ink-soft hover:bg-surface-muted transition-colors"
              >
                Ir a la app
              </button>
            </>
          )}

          {state === "accepted" && (
            <>
              <div className="mb-4 flex justify-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-pritio-green/10">
                  <svg className="h-7 w-7 text-pritio-green" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17L4 12" />
                  </svg>
                </div>
              </div>
              <h2 className="text-xl font-bold text-ink">¡Ya eres miembro!</h2>
              <p className="mt-2 text-sm text-ink-soft">
                {workspaceName
                  ? `Ahora formas parte de ${workspaceName}.`
                  : "Ya aceptaste la invitación."}
              </p>
              <button
                onClick={() => navigate("/", { replace: true })}
                className="mt-6 w-full rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-ink/90 transition-colors"
              >
                Ir a la app
              </button>
            </>
          )}

          {state === "error" && (
            <>
              <h2 className="text-xl font-bold text-ink">Error al aceptar</h2>
              <p className="mt-2 text-sm text-ink-soft">
                Ocurrió un error al procesar la invitación. Intenta de nuevo.
              </p>
              <button
                onClick={() => navigate("/", { replace: true })}
                className="mt-6 w-full rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-ink-soft hover:bg-surface-muted transition-colors"
              >
                Volver
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
