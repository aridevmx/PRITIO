import { useCallback, useState } from "react";
import { useNavigate, useParams, Navigate } from "react-router-dom";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import { Sidebar } from "@/components/layout/Sidebar";
import { UserMenu } from "@/components/layout/UserMenu";
import { NotificationBell } from "@/features/notifications/NotificationBell";
import { PendingInvitationsPopover } from "@/features/invitations/PendingInvitationsPopover";
import { PushNotificationInit } from "@/features/pushNotifications/PushNotificationInit";
import { SpaceView } from "@/features/spaces/SpaceView";
import { useAuth } from "@/features/auth/AuthProvider";
import { spacesForWorkspaceType, spacePath, SLUG_TO_SPACE } from "@/features/spaces/spaces";
import type { SpaceKey } from "@/features/spaces/spaces";
import type { ViewKey } from "@/components/layout/ViewTabs";

function availableViewsFor(workspaceType: string, space: SpaceKey): ViewKey[] {
  const isPersonal = workspaceType === "personal" || space === "personal" || space === "pendientes";
  return isPersonal
    ? ["cuadrantes", "calendario"]
    : ["cuadrantes", "calendario", "indicadores"];
}

export function AppShell() {
  const navigate = useNavigate();
  const params = useParams<{ space?: string; view?: string }>();
  const { currentWorkspace, profile } = useWorkspace();
  const { signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [calendarDate, setCalendarDate] = useState<string | null>(null);

  const workspaceType = currentWorkspace?.type ?? "personal";
  const validSpaces: SpaceKey[] = currentWorkspace
    ? spacesForWorkspaceType(currentWorkspace.type).map((s) => s.key)
    : ["pendientes"];
  const defaultSpace: SpaceKey = validSpaces[0] ?? "pendientes";

  const activeSpace = params.space ? SLUG_TO_SPACE[params.space] : undefined;

  const handleNavigateToCalendar = useCallback(
    (dateStr: string) => {
      if (!activeSpace) return;
      setCalendarDate(dateStr);
      navigate(spacePath(activeSpace, "calendario"));
    },
    [activeSpace, navigate],
  );

  if (!activeSpace || !validSpaces.includes(activeSpace)) {
    return <Navigate to={spacePath(defaultSpace)} replace />;
  }

  const availableTabs = availableViewsFor(workspaceType, activeSpace);
  const viewParam = params.view as ViewKey | undefined;
  const activeView: ViewKey =
    viewParam && (availableTabs as string[]).includes(viewParam) ? viewParam : "cuadrantes";

  const handleSpaceChange = (key: SpaceKey) => {
    const newTabs = availableViewsFor(workspaceType, key);
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
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface/80 px-4 backdrop-blur-md lg:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-1.5 text-ink-soft hover:bg-surface-muted lg:hidden"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="flex items-center gap-2 flex-1 min-w-0">
            <h1 className="text-sm font-bold text-ink truncate">
              {currentWorkspace?.name ?? ""}
            </h1>
            {currentWorkspace && (
              <span className="shrink-0 rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-semibold capitalize text-ink-muted">
                {currentWorkspace.type}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <PendingInvitationsPopover />
            <NotificationBell />
            {profile && (
              <UserMenu profile={profile} onSignOut={signOut}>
                {profile.avatarUrl ? (
                  <img
                    src={profile.avatarUrl}
                    alt=""
                    className="h-7 w-7 rounded-full object-cover border border-line cursor-pointer hover:opacity-80 transition-opacity"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = "none";
                      const fallback = target.nextElementSibling;
                      if (fallback) (fallback as HTMLElement).classList.remove("hidden");
                    }}
                  />
                ) : null}
                <div className={`flex h-7 w-7 items-center justify-center rounded-full bg-prio-purple text-[11px] font-bold text-white shadow-sm cursor-pointer hover:opacity-80 transition-opacity ${
                  profile.avatarUrl ? "hidden" : ""
                }`}>
                  {profile.fullName?.charAt(0)?.toUpperCase() ?? profile.email.charAt(0).toUpperCase()}
                </div>
              </UserMenu>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-auto" data-prio-scroll-root>
          <SpaceView
            space={activeSpace}
            view={activeView}
            onViewChange={handleViewChange}
            calendarDate={calendarDate}
          />
        </main>
      </div>
    </div>
  );
}
