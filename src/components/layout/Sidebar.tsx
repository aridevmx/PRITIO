import { useCallback } from "react";
import { cn } from "@/lib/utils";
import { PritioLogo } from "@/components/PritioLogo";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import { spacesForWorkspaceType } from "@/features/spaces/spaces";
import { APP_NAME } from "@/lib/branding";
import type { SpaceKey } from "@/features/spaces/spaces";
import { GLOBAL_VIEWS, type GlobalViewKey } from "@/components/layout/globalNav";
import { AppIcon } from "@/components/AppIcon";
import { Plus } from "@phosphor-icons/react";
import { emitAppEvent } from "@/lib/appEvents";

interface SidebarProps {
  activeSpace: SpaceKey | null;
  onSpaceChange: (space: SpaceKey) => void;
  globalView?: GlobalViewKey | null;
  onGlobalViewChange?: (view: GlobalViewKey) => void;
  isOpen: boolean;
  onClose: () => void;
  onCreateTask?: () => void;
}

export function Sidebar({
  activeSpace,
  onSpaceChange,
  globalView,
  onGlobalViewChange,
  isOpen,
  onClose,
  onCreateTask,
}: SidebarProps) {
  const { currentWorkspace } = useWorkspace();

  const spaces = currentWorkspace
    ? spacesForWorkspaceType(currentWorkspace.type)
    : [];

  const handleCreateTask = useCallback(() => {
    onCreateTask?.();
    onClose();
    emitAppEvent("pritio:create-task");
  }, [onCreateTask, onClose]);

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[85vw] max-w-72 flex-col bg-surface border-r border-line transition-transform duration-200 lg:static lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex flex-col h-full overflow-y-auto p-4 space-y-6">
          {/* Header: marca + Beta discreto */}
          <div className="flex items-center gap-2.5">
            <PritioLogo size={28} withGlow={false} />
            <span className="text-base font-extrabold tracking-tight text-ink">
              {APP_NAME}
            </span>
            <span className="ml-auto rounded-full border border-line bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
              Beta
            </span>
          </div>

          {/* Crear Tarea - Botón prominente */}
          <button
            type="button"
            onClick={handleCreateTask}
            className="flex w-full min-h-[48px] items-center gap-3 rounded-xl bg-gradient-to-r from-pritio-purple to-pritio-blue px-4 py-3 text-left font-semibold text-white shadow-sm transition-all hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pritio-purple/40"
            data-tour="crear-tarea"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/20">
              <AppIcon glyph={Plus} size="lg" />
            </span>
            <div className="flex flex-col">
              <span className="text-sm leading-tight">Crear tarea</span>
              <span className="text-[11px] opacity-80">Cmd+K</span>
            </div>
          </button>

          {/* Navegación principal - Lista plana */}
          <nav className="flex flex-col gap-0.5" aria-label="Navegación principal">
            {GLOBAL_VIEWS.map((view) => {
              const active = globalView === view.key;
              return (
                <button
                  key={view.key}
                  onClick={() => {
                    onGlobalViewChange?.(view.key);
                    onClose();
                  }}
                  className={cn(
                    "flex w-full min-h-[44px] items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pritio-purple/40",
                    active
                      ? "bg-surface-muted text-ink"
                      : "text-ink-muted hover:bg-surface-muted hover:text-ink-soft",
                  )}
                  data-tour={view.key}
                >
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                      active ? view.accent.softBg : "bg-surface-muted",
                      active ? view.accent.text : "text-ink-muted",
                    )}
                  >
                    <AppIcon glyph={view.icon} weight={active ? "fill" : "regular"} />
                  </span>
                  <span className="truncate">{view.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Espacios del workspace actual (colapsable, al final) */}
          {spaces.length > 0 && (
            <div className="border-t border-line pt-4">
              <p className="text-xs text-ink-muted uppercase tracking-wide mb-2">
                Espacios
              </p>
              <nav className="flex flex-col gap-0.5" aria-label="Espacios del workspace">
                {spaces.map((space) => (
                  <button
                    key={space.key}
                    onClick={() => {
                      onSpaceChange(space.key);
                      onClose();
                    }}
                    className={cn(
                      "flex w-full min-h-[40px] items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pritio-purple/40",
                      activeSpace === space.key
                        ? "bg-surface-muted text-ink"
                        : "text-ink-muted hover:bg-surface-muted hover:text-ink-soft",
                    )}
                    data-tour={space.key}
                  >
                    <div className={cn("h-2 w-2 rounded-full shrink-0", space.accent.bg)} />
                    <span>{space.label}</span>
                  </button>
                ))}
              </nav>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}