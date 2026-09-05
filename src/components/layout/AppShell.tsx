import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Navigate } from "react-router-dom";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import { useViewPrefs } from "@/lib/viewPrefs";
import { Sidebar } from "@/components/layout/Sidebar";
import { UserMenu } from "@/components/layout/UserMenu";
import { MemberPresenceStack } from "@/components/layout/MemberPresenceStack";
import { TourOverlay, hasTourBeenSeen } from "@/features/tour/TourOverlay";
import { NotificationBell } from "@/features/notifications/NotificationBell";
import { NotificationToastHost } from "@/features/notifications/NotificationToastHost";
import { PendingInvitationsPopover } from "@/features/invitations/PendingInvitationsPopover";
import { PushNotificationInit } from "@/features/pushNotifications/PushNotificationInit";
import { UpgradeHost } from "@/features/billing/UpgradeHost";
import { SpaceView } from "@/features/spaces/SpaceView";
import { useAuth } from "@/features/auth/AuthProvider";
import { useBilling } from "@/features/billing/BillingProvider";
import { spacesForWorkspaceType, spacePath, SLUG_TO_SPACE, SPACES } from "@/features/spaces/spaces";
import type { SpaceKey } from "@/features/spaces/spaces";
import type { ViewKey } from "@/components/layout/ViewTabs";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { cn } from "@/lib/utils";
import { onAppEvent, emitAppEvent } from "@/lib/appEvents";

function baseViewsFor(_workspaceType: string, _space: SpaceKey): ViewKey[] {
  // Todas las vistas están disponibles en cualquier workspace/espacio.
  void _workspaceType;
  void _space;
  return ["cuadrantes", "plan", "kanban", "calendario", "docs", "indicadores"];
}

export function AppShell() {
  const navigate = useNavigate();
  const params = useParams<{ space?: string; view?: string }>();
  const { currentWorkspace, profile } = useWorkspace();
  const { hasFeature } = useBilling();
  const { signOut } = useAuth();
  const { hiddenViews } = useViewPrefs();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [calendarDate, setCalendarDate] = useState<string | null>(null);
  const [tourOpen, setTourOpen] = useState(false);

  const workspaceType = currentWorkspace?.type ?? "personal";
  const validSpaces: SpaceKey[] = useMemo(
    () =>
      currentWorkspace
        ? spacesForWorkspaceType(currentWorkspace.type).map((s) => s.key)
        : ["pendientes"],
    [currentWorkspace],
  );
  const defaultSpace: SpaceKey = validSpaces[0] ?? "pendientes";

  const activeSpace = params.space ? SLUG_TO_SPACE[params.space] : undefined;

  const tabsForSpace = useCallback(
    (space: SpaceKey) => {
      return baseViewsFor(workspaceType, space)
        .filter((v) => !hiddenViews.includes(v))
        .filter((v) => v !== "plan" || hasFeature("plan_view"))
        .filter((v) => v !== "kanban" || hasFeature("board_view"));
    },
    [workspaceType, hiddenViews, hasFeature],
  );

  const availableTabs = useMemo(
    () => (activeSpace ? tabsForSpace(activeSpace) : []),
    [activeSpace, tabsForSpace],
  );

  const viewParam = params.view as ViewKey | undefined;

  useEffect(() => {
    if (
      viewParam &&
      activeSpace &&
      validSpaces.includes(activeSpace) &&
      !(availableTabs as string[]).includes(viewParam)
    ) {
      navigate(spacePath(activeSpace, "cuadrantes"), { replace: true });
    }
  }, [viewParam, activeSpace, validSpaces, availableTabs, navigate]);

  const handleNavigateToCalendar = useCallback(
    (dateStr: string) => {
      if (!activeSpace) return;
      setCalendarDate(dateStr);
      navigate(spacePath(activeSpace, "calendario"));
    },
    [activeSpace, navigate],
  );

  useEffect(() => {
    if (currentWorkspace && !hasTourBeenSeen()) {
      const t = setTimeout(() => setTourOpen(true), 800);
      return () => clearTimeout(t);
    }
  }, [currentWorkspace]);

  useEffect(() => {
    return onAppEvent("pritio:startTour", () => setTourOpen(true));
  }, []);

  if (!activeSpace || !validSpaces.includes(activeSpace)) {
    return <Navigate to={spacePath(defaultSpace)} replace />;
  }

  const activeView: ViewKey =
    viewParam && (availableTabs as string[]).includes(viewParam) ? viewParam : "cuadrantes";

  const handleSpaceChange = (key: SpaceKey) => {
    const newTabs = tabsForSpace(key);
    const view = (newTabs as string[]).includes(activeView) ? activeView : "cuadrantes";
    navigate(spacePath(key, view));
  };

  const handleViewChange = (key: ViewKey) => {
    navigate(spacePath(activeSpace, key));
  };

  return (
    <div className="flex h-screen overflow-hidden bg-surface-muted">
      <Sidebar
        activeSpace={activeSpace}
        onSpaceChange={handleSpaceChange}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNavigateToCalendar={handleNavigateToCalendar}
      />

      <PushNotificationInit />
      <NotificationToastHost />
      <UpgradeHost />
      <TourOverlay open={tourOpen} onClose={() => setTourOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line/70 bg-surface/75 px-4 backdrop-blur-xl lg:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menú"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-ink-soft transition-colors hover:bg-surface-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pritio-blue/40 lg:hidden"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span
              aria-hidden
              className={cn("h-2.5 w-2.5 shrink-0 rounded-full", SPACES[activeSpace].accent.bg)}
            />
            <h1 className="truncate text-sm font-bold tracking-tight text-ink">
              {currentWorkspace?.name ?? ""}
            </h1>
            {currentWorkspace && (
              <span className="shrink-0 rounded-full border border-line bg-surface-muted px-2 py-0.5 text-[11px] font-semibold capitalize text-ink-soft">
                {currentWorkspace.type}
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              onClick={() => emitAppEvent("pritio:app-refresh")}
              aria-label="Refrescar datos"
              title="Refrescar datos"
              className="grid h-9 w-9 place-items-center rounded-xl text-ink-soft transition-colors hover:bg-surface-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pritio-blue/40"
            >
              <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M20 11a8.1 8.1 0 0 0-15.5-2m-.5-4v4h4m0 6a8.1 8.1 0 0 0 15.5-2m.5 4v-4h-4"
                />
              </svg>
            </button>
            <PendingInvitationsPopover />
            <NotificationBell />
            <MemberPresenceStack
              workspaceId={currentWorkspace?.id ?? null}
              profileId={profile?.id ?? null}
            />
            {profile && (
              <UserMenu profile={profile} onSignOut={signOut}>
                {profile.avatarUrl ? (
                  <img
                    src={profile.avatarUrl}
                    alt=""
                    className="h-7 w-7 cursor-pointer rounded-full object-cover ring-1 ring-line/70 transition group-hover:ring-2 group-hover:ring-pritio-purple/40"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = "none";
                      const fallback = target.nextElementSibling;
                      if (fallback) (fallback as HTMLElement).classList.remove("hidden");
                    }}
                  />
                ) : null}
                <div className={`flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-pritio-purple to-pritio-blue text-[11px] font-bold text-white shadow-sm transition group-hover:ring-2 group-hover:ring-pritio-purple/40 ${
                  profile.avatarUrl ? "hidden" : ""
                }`}>
                  {profile.fullName?.charAt(0)?.toUpperCase() ?? profile.email.charAt(0).toUpperCase()}
                </div>
              </UserMenu>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-x-hidden overflow-y-auto pb-20 lg:pb-0" data-pritio-scroll-root>
          <SpaceView
            space={activeSpace}
            view={activeView}
            onViewChange={handleViewChange}
            calendarDate={calendarDate}
          />
        </main>

        <MobileBottomNav
          activeView={activeView}
          availableTabs={availableTabs}
          onViewChange={handleViewChange}
        />
      </div>
    </div>
  );
}
