import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Navigate, useLocation } from "react-router-dom";
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
import { GlobalFAB } from "@/components/layout/GlobalFAB";
import { globalViewFromPath, globalViewPath, type GlobalViewKey } from "@/components/layout/globalNav";
import { InboxView } from "@/features/inbox/InboxView";
import { MiDiaView } from "@/features/home/MiDiaView";
import { GlobalSearch } from "@/components/layout/GlobalSearch";
import { RightWidgetPanel } from "@/components/layout/RightWidgetPanel";
import { cn } from "@/lib/utils";
import { onAppEvent, emitAppEvent } from "@/lib/appEvents";
import { QuadrantsView } from "@/features/tasks/QuadrantsView";
import { AddTaskDialog } from "@/features/tasks/AddTaskDialog";
import { ProjectsGlobalView } from "@/features/projects/ProjectsGlobalView";
import { DocsGlobalView } from "@/features/docs/DocsGlobalView";
import { StatsGlobalView } from "@/features/stats/StatsGlobalView";
import { CalendarGlobalView } from "@/features/calendar/CalendarGlobalView";
import { WorkspaceSelector } from "@/components/layout/WorkspaceSelector";

function baseViewsFor(_workspaceType: string, _space: SpaceKey): ViewKey[] {
  void _workspaceType;
  void _space;
  return ["cuadrantes", "plan", "kanban", "calendario", "docs", "indicadores"];
}

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ space?: string; view?: string }>();
  const { currentWorkspace, workspaces, profile } = useWorkspace();
  const { hasFeature } = useBilling();
  const { signOut } = useAuth();
  const { hiddenViews } = useViewPrefs();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [calendarDate, setCalendarDate] = useState<string | null>(null);
  const [tourOpen, setTourOpen] = useState(false);
  const [workspaceSelectorOpen, setWorkspaceSelectorOpen] = useState(false);

  const globalView = globalViewFromPath(location.pathname);
  const isGlobal = globalView !== null;

  const workspaceType = currentWorkspace?.type ?? "personal";
  const validSpaces: SpaceKey[] = useMemo(
    () =>
      currentWorkspace
        ? spacesForWorkspaceType(currentWorkspace.type).map((s) => s.key)
        : ["pendientes"],
    [currentWorkspace],
  );

  // IDs de todos los workspaces del mismo tipo que el actual (vistas agregadas).
  const workspaceIds = useMemo(() => {
    if (!currentWorkspace) return [];
    return workspaces
      .filter((w) => w.type === currentWorkspace.type)
      .map((w) => w.id);
  }, [currentWorkspace, workspaces]);

  const activeSpace = params.space ? SLUG_TO_SPACE[params.space] : undefined;

  // Ruta del primer espacio del workspace actual: destino para "/" y para
  // slugs inválidos (evita el Navigate a sí mismo, que dejaba la app en blanco).
  const defaultSpacePath = useMemo(() => {
    if (!currentWorkspace) return null;
    const first = spacesForWorkspaceType(currentWorkspace.type)[0]?.key ?? "pendientes";
    return spacePath(first);
  }, [currentWorkspace]);

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
      (tabsForSpace(activeSpace) as string[]).includes(viewParam) === false &&
      validSpaces.includes(activeSpace)
    ) {
      navigate(spacePath(activeSpace, "cuadrantes"), { replace: true });
    }
  }, [viewParam, activeSpace, validSpaces, tabsForSpace, navigate]);

  const handleNavigateToCalendar = useCallback(
    (dateStr: string) => {
      if (!activeSpace || isGlobal) return;
      setRightPanelOpen(false);
      setCalendarDate(dateStr);
      navigate(spacePath(activeSpace, "calendario"));
    },
    [activeSpace, isGlobal, navigate],
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

  const handleGlobalViewChange = useCallback(
    (key: GlobalViewKey) => {
      navigate(globalViewPath(key));
      setSidebarOpen(false);
    },
    [navigate],
  );

  const handleCreateTask = useCallback(() => {
    emitAppEvent("pritio:create-task");
  }, []);

  // Cmd+K global shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        handleCreateTask();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleCreateTask]);

  if (!isGlobal) {
    if (!activeSpace || !validSpaces.includes(activeSpace)) {
      return <Navigate to={defaultSpacePath ?? "/"} replace />;
    }
  }

  const activeView: ViewKey =
    viewParam && (availableTabs as string[]).includes(viewParam) ? viewParam : "cuadrantes";

  const handleSpaceChange = (key: SpaceKey) => {
    const newTabs = tabsForSpace(key);
    const view = (newTabs as string[]).includes(activeView) ? activeView : "cuadrantes";
    navigate(spacePath(key, view));
  };

  const handleViewChange = (key: ViewKey) => {
    if (activeSpace) navigate(spacePath(activeSpace, key));
  };

  const headerAccent =
    !isGlobal && activeSpace ? SPACES[activeSpace].accent.bg : SPACES.pendientes.accent.bg;

  const renderMain = () => {
    if (isGlobal && globalView) {
      switch (globalView) {
        case "inbox":
          return <InboxView />;
        case "mi-dia":
          return <MiDiaView />;
        case "cuadrantes":
          return <QuadrantsView workspaceIds={workspaceIds} />;
        case "calendario":
          return <CalendarGlobalView workspaceIds={workspaceIds} />;
        case "proyectos":
          return <ProjectsGlobalView workspaceIds={workspaceIds} />;
        case "docs":
          return <DocsGlobalView workspaceIds={workspaceIds} />;
        case "indicadores":
          return <StatsGlobalView workspaceIds={workspaceIds} />;
      }
    }
    return (
      <SpaceView
        space={activeSpace!}
        view={activeView}
        onViewChange={handleViewChange}
        calendarDate={calendarDate}
      />
    );
  };

  return (
    <div className="flex h-screen overflow-hidden bg-surface-muted">
      <Sidebar
        activeSpace={isGlobal ? null : activeSpace!}
        onSpaceChange={handleSpaceChange}
        globalView={isGlobal ? globalView : null}
        onGlobalViewChange={handleGlobalViewChange}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onCreateTask={handleCreateTask}
      />

      <RightWidgetPanel
        open={rightPanelOpen}
        onClose={() => setRightPanelOpen(false)}
        space={activeSpace ?? null}
        onNavigateToCalendar={handleNavigateToCalendar}
      />

      <PushNotificationInit />
      <NotificationToastHost />
      <UpgradeHost />
      <AddTaskDialog />
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
            <span aria-hidden className={cn("h-2.5 w-2.5 shrink-0 rounded-full", headerAccent)} />
            {currentWorkspace && (
              <WorkspaceSelector
                currentWorkspace={currentWorkspace}
                workspaces={workspaces}
                isOpen={workspaceSelectorOpen}
                onClose={() => setWorkspaceSelectorOpen(false)}
                onOpenChange={setWorkspaceSelectorOpen}
              />
            )}
          </div>

          {isGlobal && globalView !== "inbox" && (
            <div className="hidden w-full max-w-md flex-1 lg:block">
              <GlobalSearch />
            </div>
          )}

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
            <button
              onClick={() => setRightPanelOpen(true)}
              aria-label="Abrir calendario y utilidades"
              title="Calendario y utilidades"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-ink-soft transition-colors hover:bg-surface-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pritio-blue/40"
            >
              <span className="relative grid h-6 w-6 place-items-center">
                <svg className="h-6 w-6" viewBox="0 0 20 20" fill="none" aria-hidden>
                  <rect x="2.5" y="3" width="15" height="14.5" rx="2" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M2.5 7.5H17.5" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M6 1.5V4.5M14 1.5V4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                <span className="absolute right-0 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-pritio-purple px-1 text-[9px] font-bold text-white">
                  {new Date().getDate()}
                </span>
              </span>
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

        <main className="flex-1 overflow-x-hidden overflow-y-auto pb-24 lg:pb-0" data-pritio-scroll-root>
          {renderMain()}
        </main>

        <MobileBottomNav />
        {globalView !== "inbox" && <GlobalFAB globalView={globalView} />}
      </div>
    </div>
  );
}