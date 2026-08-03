import { useEffect } from "react";
import { X } from "lucide-react";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import {
  spacesForWorkspaceType,
  type SpaceKey,
  type SpaceMeta,
} from "@/features/spaces/spaces";
import { SpaceIcon } from "@/components/SpaceIcon";
import { WorkspaceSwitcher } from "@/components/layout/WorkspaceSwitcher";
import { PrioLogo } from "@/components/PrioLogo";
import { TodayMeetingsPanel } from "@/features/calendar/TodayMeetingsPanel";
import { SidebarMiniCalendar } from "@/features/calendar/SidebarMiniCalendar";
import { cn } from "@/lib/utils";

interface SidebarProps {
  activeSpace: SpaceKey;
  onSelectSpace: (key: SpaceKey) => void;
  onCreateWorkspace?: (kind?: "team" | "family") => void;
  /**
   * En mobile el sidebar funciona como drawer. Estos dos props lo
   * controlan: open=true muestra el panel deslizado + backdrop. En
   * md+ el sidebar es estatico y open se ignora (siempre visible).
   */
  open: boolean;
  onClose: () => void;
}

export function Sidebar({
  activeSpace,
  onSelectSpace,
  onCreateWorkspace,
  open,
  onClose,
}: SidebarProps) {
  const { activeWorkspace } = useWorkspace();
  const workspaceSpaces = activeWorkspace
    ? spacesForWorkspaceType(activeWorkspace.type)
    : [];

  // Esc cierra el drawer en mobile. En md+ no afecta porque el
  // sidebar es estatico.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop: solo se renderiza cuando el drawer esta abierto.
          md:hidden lo desactiva en desktop para evitar overlay
          accidental. */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-sm md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        aria-label="Navegacion principal"
        className={cn(
          "z-50 flex w-72 shrink-0 flex-col self-stretch border-r border-line bg-white/95 px-4 py-6 backdrop-blur-md",
          // Mobile: fixed drawer con slide animation.
          "fixed inset-y-0 left-0 transform transition-transform duration-200 ease-out [padding-bottom:max(1.5rem,env(safe-area-inset-bottom))]",
          open ? "translate-x-0" : "-translate-x-full",
          // Desktop: estatico, sin transform.
          "md:relative md:translate-x-0 md:bg-white/60 md:transition-none",
        )}
      >
        {/* Close button: solo visible en mobile cuando el drawer
            esta abierto. md:hidden lo desactiva en desktop. */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar menu"
          className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full text-ink-soft transition-colors hover:bg-surface-muted hover:text-ink md:hidden"
        >
          <X size={16} />
        </button>
      {/* Logo */}
      <div className="flex items-center gap-3 px-2">
        <PrioLogo size={28} />
        <div className="flex items-baseline gap-2">
          <span className="text-base font-bold tracking-tight text-ink">
            PRIO
          </span>
          <span className="rounded-full bg-surface-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-ink-soft">
            Beta
          </span>
        </div>
      </div>

      {/* Workspace switcher */}
      <div className="mt-6 px-1">
        <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
          Workspace activo
        </div>
        <WorkspaceSwitcher onCreateWorkspace={onCreateWorkspace} />
      </div>

      <div className="my-5 border-t border-line/70" />

      {/* Spaces dentro del workspace activo. Pendientes ya no es
          una seccion "Foco" aparte: vive como space del Personal
          workspace. Asi en team/family no aparece en el sidebar. */}
      {workspaceSpaces.length > 0 && (
        <NavSection
          label={
            activeWorkspace?.type === "team"
              ? "Equipo"
              : activeWorkspace?.type === "family"
                ? "Familia"
                : "Mi espacio"
          }
        >
          {workspaceSpaces.map((space) => (
            <NavItem
              key={space.key}
              space={space}
              active={activeSpace === space.key}
              onClick={() => onSelectSpace(space.key)}
            />
          ))}
        </NavSection>
      )}

      {/* Juntas de hoy del workspace activo. Se auto-oculta si no
          hay juntas (mantiene el sidebar limpio cuando no aplica). */}
      <TodayMeetingsPanel />

      {/* Mini-calendario heatmap (solo desktop). En mobile la
          pantalla Calendar ya tiene su propio calendario y aqui
          seria redundante. */}
      <SidebarMiniCalendar />

        <div className="mt-auto px-2 text-[10px] text-ink-muted">
          © {new Date().getFullYear()} Timbal · PRIO
        </div>
      </aside>
    </>
  );
}

function NavSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
        {label}
      </div>
      <ul className="space-y-0.5">{children}</ul>
    </div>
  );
}

function NavItem({
  space,
  active,
  onClick,
}: {
  space: SpaceMeta;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all",
          active
            ? cn("bg-white shadow-soft", space.accent.text)
            : "text-ink-soft hover:bg-white/70 hover:text-ink",
        )}
      >
        {active && (
          <span
            aria-hidden
            className={cn(
              "absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full",
              space.accent.bg,
            )}
          />
        )}
        <SpaceIcon space={space.key} size={18} />
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "text-sm font-medium",
              active ? "text-ink" : undefined,
            )}
          >
            {space.label}
          </div>
          <div className="truncate text-[11px] text-ink-muted">
            {space.subtitle}
          </div>
        </div>
      </button>
    </li>
  );
}
