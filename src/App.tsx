import { BrowserRouter, Routes, Route, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ToastProvider } from "@/components/Toast";
import { AuthProvider, useAuth } from "@/features/auth/AuthProvider";
import { AuthScreen } from "@/features/auth/AuthScreen";
import { ResetPasswordScreen } from "@/features/auth/ResetPasswordScreen";
import { WorkspaceProvider, useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import { BillingProvider } from "@/features/billing/BillingProvider";
import { AppShell } from "@/components/layout/AppShell";
import { LogoLoader } from "@/components/LogoLoader";
import { OfflineBanner } from "@/components/OfflineBanner";
import { JoinScreen } from "@/features/invitations/JoinScreen";
import { DownloadScreen } from "@/features/download/DownloadScreen";
import { AsanaOAuthCallback } from "@/features/integrations/AsanaOAuthCallback";

function PendingInvitationRedirect() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    const pending = localStorage.getItem("pritio-pending-invitation");
    if (pending) {
      localStorage.removeItem("pritio-pending-invitation");
      navigate(`/invitacion/${pending}`, { replace: true });
    }
  }, [user, navigate]);

  return null;
}

function AuthenticatedApp() {
  const { loading } = useWorkspace();

  if (loading) {
    return <LogoLoader />;
  }

  return <Outlet />;
}

const LAST_ROUTE_KEY = "pritio:lastRoute";

function RootRedirect() {
  const { user, loading: authLoading } = useAuth();
  const { loading: wsLoading } = useWorkspace();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (authLoading || wsLoading || !user) return;
    if (location.pathname !== "/") return;
    try {
      const last = localStorage.getItem(LAST_ROUTE_KEY);
      if (last && last.startsWith("/") && last !== "/" && last !== "/auth" && last !== "/auth/callback") {
        navigate(last, { replace: true });
      } else {
        navigate("/mi-dia", { replace: true });
      }
    } catch {
      navigate("/mi-dia", { replace: true });
    }
  }, [authLoading, wsLoading, user, navigate, location.pathname]);

  if (authLoading || wsLoading) {
    return <LogoLoader />;
  }

  if (!user) {
    return <AuthScreen />;
  }

  return null;
}

function Root() {
  const { user, loading: authLoading } = useAuth();

  if (authLoading) {
    return <LogoLoader />;
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <WorkspaceProvider>
      <BillingProvider>
        <RootRedirect />
        <AuthenticatedApp />
        <OfflineBanner />
      </BillingProvider>
    </WorkspaceProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <BrowserRouter>
          <AuthProvider>
            <PendingInvitationRedirect />
            <Routes>
              <Route path="/invitacion/:id" element={<JoinScreen />} />
              <Route path="/reset-password" element={<ResetPasswordScreen />} />
              <Route path="/download" element={<DownloadScreen />} />
              <Route element={<Root />}>
                <Route index element={<AppShell />} />
                <Route path="inbox" element={<AppShell />} />
                <Route path="mi-dia" element={<AppShell />} />
                <Route path="cuadrantes" element={<AppShell />} />
                <Route path="calendario" element={<AppShell />} />
                <Route path="proyectos" element={<AppShell />} />
                <Route path="notas" element={<AppShell />} />
                <Route path="indicadores" element={<AppShell />} />
                <Route path="oauth/asana/callback" element={<AsanaOAuthCallback />} />
                <Route path=":space/:view?" element={<AppShell />} />
                <Route path="*" element={<AppShell />} />
              </Route>
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </ErrorBoundary>
  );
}
