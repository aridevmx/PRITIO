import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { PritioLogo } from "@/components/PritioLogo";
import { APP_NAME } from "@/lib/branding";
import { GLOBAL_VIEWS, type GlobalViewKey } from "@/components/layout/globalNav";
import { AppIcon } from "@/components/AppIcon";
import { Plus, SidebarSimple } from "@phosphor-icons/react";
import { emitAppEvent } from "@/lib/appEvents";
import { useIsDesktop } from "@/lib/useMediaQuery";

interface SidebarProps {
  globalView?: GlobalViewKey | null;
  onGlobalViewChange?: (view: GlobalViewKey) => void;
  isOpen: boolean;
  onClose: () => void;
  onCreateTask?: () => void;
}

const COLLAPSED_KEY = "pritio:leftSidebarCollapsed";

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function Sidebar({
  globalView,
  onGlobalViewChange,
  isOpen,
  onClose,
  onCreateTask,
}: SidebarProps) {
  const isDesktop = useIsDesktop();
  const [collapsed, setCollapsed] = useState(readCollapsed);

  /* El rail solo aplica en escritorio; en móvil siempre se muestra completo. */
  const rail = collapsed && isDesktop;

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* localStorage no disponible — ignorar */
      }
      return next;
    });
  };

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
          "fixed inset-y-0 left-0 z-50 flex w-[85vw] max-w-72 flex-col border-r border-line bg-surface transition-transform duration-200 lg:static lg:translate-x-0 lg:transition-[width]",
          isOpen ? "translate-x-0" : "-translate-x-full",
          rail ? "lg:w-14" : "lg:w-72",
        )}
      >
        <div
          className={cn(
            "flex h-full flex-col overflow-y-auto",
            rail ? "items-center gap-3 p-2" : "space-y-6 p-4",
          )}
        >
          {rail ? (
            <>
              <button
                type="button"
                onClick={toggleCollapsed}
                title="Expandir menú"
                aria-label="Expandir menú"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-surface-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pritio-purple/40"
              >
                <AppIcon glyph={SidebarSimple} />
              </button>

              <button
                type="button"
                onClick={handleCreateTask}
                title="Crear tarea (Cmd+K)"
                aria-label="Crear tarea"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-r from-pritio-purple to-pritio-blue text-white shadow-sm transition-all hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pritio-purple/40"
                data-tour="crear-tarea"
              >
                <AppIcon glyph={Plus} size="lg" />
              </button>

              <nav
                className="flex flex-col gap-1"
                aria-label="Navegación principal"
              >
                {GLOBAL_VIEWS.map((view) => {
                  const active = globalView === view.key;
                  return (
                    <button
                      key={view.key}
                      type="button"
                      onClick={() => {
                        onGlobalViewChange?.(view.key);
                        onClose();
                      }}
                      aria-label={view.label}
                      title={view.label}
                      className={cn(
                        "grid h-10 w-10 place-items-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pritio-purple/40",
                        active
                          ? view.accent.softBg
                          : "text-ink-muted hover:bg-surface-muted hover:text-ink-soft",
                      )}
                      data-tour={view.key}
                    >
                      <AppIcon
                        glyph={view.icon}
                        weight={active ? "fill" : "regular"}
                        className={active ? view.accent.text : undefined}
                      />
                    </button>
                  );
                })}
              </nav>
            </>
          ) : (
            <>
              {/* Header: marca + Beta discreto */}
              <div className="flex items-center gap-2.5">
                <PritioLogo size={28} withGlow={false} />
                <span className="text-base font-extrabold tracking-tight text-ink">
                  {APP_NAME}
                </span>
                <span className="ml-auto rounded-full border border-line bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                  Beta
                </span>
                <button
                  type="button"
                  onClick={toggleCollapsed}
                  title="Colapsar menú a iconos"
                  aria-label="Colapsar menú a iconos"
                  className="hidden h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-surface-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pritio-purple/40 lg:grid"
                >
                  <AppIcon glyph={SidebarSimple} />
                </button>
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

            </>
          )}

          {/* Espacios del workspace actual (temporalmente comentado) */}
          {/*}

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
          */}
        </div>
      </aside>
    </>
  );
}