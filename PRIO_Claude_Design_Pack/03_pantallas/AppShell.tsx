import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Menu } from "lucide-react";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import {
  spacesForWorkspaceType,
  SPACES,
  type SpaceKey,
} from "@/features/spaces/spaces";
import { Sidebar } from "@/components/layout/Sidebar";
import { UserMenu } from "@/components/layout/UserMenu";
import { SpaceView } from "@/features/spaces/SpaceView";
import { CreateWorkspaceDialog } from "@/features/workspaces/CreateWorkspaceDialog";
import { NotificationBell } from "@/features/notifications/NotificationBell";
import { TaskNavigationProvider } from "@/features/tasks/TaskNavigationProvider";
// Lazy: el modal aparece solo en el primer login del dia.
const DailyRecapDialog = lazy(() =>
  import("@/features/dailyRecap/DailyRecapDialog").then((m) => ({
    default: m.DailyRecapDialog,
  })),
);
import { useDailyRecap } from "@/features/dailyRecap/useDailyRecap";
import { MeetingReminderToast } from "@/features/meetingReminders/MeetingReminderToast";
import { useMeetingReminders } from "@/features/meetingReminders/useMeetingReminders";
import { useAutoPromoteOnLoad } from "@/features/workspaces/useAutoPromoteOnLoad";
import { cn } from "@/lib/utils";

const ACTIVE_SPACE_KEY = "prio.activeSpace";

type CreateKind = "team" | "family" | undefined;

export function AppShell() {
  const { activeWorkspace, isLoading, error } = useWorkspace();
  const [activeSpace, setActiveSpace] = useState<SpaceKey>(() => {
    const stored = localStorage.getItem(ACTIVE_SPACE_KEY) as SpaceKey | null;
    return stored ?? "pendientes";
  });
  const [createState, setCreateState] = useState<{
    open: boolean;
    kind: CreateKind;
  }>({ open: false, kind: undefined });

  // Drawer del sidebar en mobile. En md+ el sidebar es estatico y
  // este flag no aplica; igualmente se mantiene en false porque el
  // hamburger queda oculto via md:hidden.
  const [sidebarOpen, setSidebarOpen] = useState(false);

  function openCreateWorkspace(kind?: "team" | "family") {
    setCreateState({ open: true, kind });
  }
  function closeCreateWorkspace() {
    setCreateState({ open: false, kind: undefined });
  }

  // Valida que activeSpace siga siendo accesible en el workspace
  // actual. Si no (ej. estabas en Pendientes y cambiaste a un team
  // workspace que no la lista), saltamos al primer space valido.
  useEffect(() => {
    if (!activeWorkspace) return;
    const validSpaces = spacesForWorkspaceType(activeWorkspace.type);
    const isValid = validSpaces.some((s) => s.key === activeSpace);
    if (!isValid && validSpaces.length > 0) {
      setActiveSpace(validSpaces[0].key);
    }
  }, [activeWorkspace, activeSpace]);

  function handleSelectSpace(key: SpaceKey) {
    setActiveSpace(key);
    localStorage.setItem(ACTIVE_SPACE_KEY, key);
    // En mobile el sidebar es un drawer: al elegir un space lo
    // cerramos para que la vista del space quede a la vista. En
    // desktop el sidebar es estatico y este setter no tiene efecto.
    setSidebarOpen(false);
  }

  const spaceMeta = useMemo(() => SPACES[activeSpace], [activeSpace]);

  // Recap diario: el hook decide cuando mostrar (gate por dia +
  // contenido no vacio). Se muestra encima de la app.
  // Mueve tareas vencidas/del dia a Haz ahora si el workspace tiene
  // el toggle activado (mig 0068). Idempotente, una vez por dia.
  useAutoPromoteOnLoad();

  const { recap, shouldShow: showRecap, dismiss: dismissRecap } = useDailyRecap();

  // Avisos de juntas proximas (in-app). El hook re-evalua cada
  // minuto y maneja dismiss persistente en localStorage.
  const { current: meetingReminder, dismiss: dismissMeetingReminder } =
    useMeetingReminders();

  if (isLoading) {
    return <FullScreenLoading />;
  }

  if (error) {
    return <FullScreenError message={error} />;
  }

  return (
    <TaskNavigationProvider onSelectSpace={handleSelectSpace}>
      <div className={cn("flex h-[100dvh] overflow-hidden", spaceMeta.accent.shellBg)}>
        <Sidebar
          activeSpace={activeSpace}
          onSelectSpace={handleSelectSpace}
          onCreateWorkspace={openCreateWorkspace}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line/60 bg-white/70 px-4 py-3 backdrop-blur-md md:px-8 md:py-4 dark:border-white/10 dark:bg-slate-900/70">
            <div className="flex min-w-0 items-center gap-2">
              {/* Hamburger: solo en mobile. En md+ el sidebar es
                  estatico y el boton se oculta. */}
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                aria-label="Abrir menu"
                className="-ml-1 grid h-10 w-10 shrink-0 place-items-center rounded-xl text-ink-soft transition-colors hover:bg-surface-muted hover:text-ink md:hidden"
              >
                <Menu size={20} />
              </button>
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted dark:text-slate-400">
                  {spaceMeta.subtitle}
                </div>
                <h1 className="truncate text-xl font-bold tracking-tight text-ink dark:text-white">
                  {spaceMeta.label}
                </h1>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <NotificationBell />
              <UserMenu />
            </div>
          </header>

          <main
            data-prio-scroll-root
            className="flex-1 overflow-y-auto px-4 pb-4 [padding-bottom:max(1rem,env(safe-area-inset-bottom))] md:px-8 md:pb-8 md:[padding-bottom:max(2rem,env(safe-area-inset-bottom))]"
          >
            {/* Wrapper interno con el pt: como vive DENTRO del scroll
                viewport, su padding scrollea con el contenido. Asi al
                bajar la pagina el sticky mini-nav del QuadrantsView se
                pega al header (no queda un hueco con la pt del main). */}
            <div className="pt-4 md:pt-8">
              <SpaceView
                spaceKey={activeSpace}
                onCreateWorkspace={openCreateWorkspace}
              />
            </div>
          </main>
        </div>

        {createState.open && (
          <CreateWorkspaceDialog
            initialKind={createState.kind}
            onClose={closeCreateWorkspace}
          />
        )}

        <Suspense fallback={null}>
          {showRecap && recap && (
            <DailyRecapDialog recap={recap} onClose={dismissRecap} />
          )}
        </Suspense>

        {meetingReminder && (
          <MeetingReminderToast
            reminder={meetingReminder}
            onDismiss={() => dismissMeetingReminder(meetingReminder.meeting.id)}
          />
        )}
      </div>
    </TaskNavigationProvider>
  );
}

function FullScreenLoading() {
  return (
    <main className="grid min-h-screen place-items-center bg-shell-pendientes">
      <div className="text-center text-sm text-ink-soft">Cargando...</div>
    </main>
  );
}

function FullScreenError({ message }: { message: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-shell-pendientes p-6">
      <div className="max-w-md rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm font-semibold text-red-800">
          No pudimos cargar tus workspaces
        </p>
        <p className="mt-2 text-xs text-red-700">{message}</p>
      </div>
    </main>
  );
}

