import { cn } from "@/lib/utils";
import { emitAppEvent } from "@/lib/appEvents";
import type { ViewKey } from "@/components/layout/ViewTabs";
import type { ReactNode } from "react";

const VIEW_LABELS: Record<ViewKey, string> = {
  cuadrantes: "Cuadrantes",
  plan: "Plan",
  kanban: "Tablero",
  calendario: "Calendario",
  docs: "Documentos",
  indicadores: "Indicadores",
};

const VIEW_ICONS: Record<ViewKey, ReactNode> = {
  cuadrantes: (
    <svg className="h-[22px] w-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <rect x="4" y="4" width="7" height="7" rx="1.75" />
      <rect x="13" y="4" width="7" height="7" rx="1.75" />
      <rect x="4" y="13" width="7" height="7" rx="1.75" />
      <rect x="13" y="13" width="7" height="7" rx="1.75" />
    </svg>
  ),
  plan: (
    <svg className="h-[22px] w-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <rect x="4" y="5" width="16" height="16" rx="2.5" />
      <path d="M4 10.5h16" />
      <path d="M9 3v4" />
      <path d="M15 3v4" />
      <path d="M8.5 15l2 2 4-4.5" />
    </svg>
  ),
  kanban: (
    <svg className="h-[22px] w-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <rect x="3.5" y="4" width="5" height="16" rx="1.5" />
      <rect x="10" y="4" width="5" height="12" rx="1.5" />
      <rect x="16.5" y="4" width="4" height="9" rx="1.5" />
    </svg>
  ),
  calendario: (
    <svg className="h-[22px] w-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <rect x="3.5" y="5" width="17" height="16" rx="2" />
      <path d="M3.5 10h17" strokeLinecap="round" />
      <path d="M8 3v4" strokeLinecap="round" />
      <path d="M16 3v4" strokeLinecap="round" />
    </svg>
  ),
  docs: (
    <svg className="h-[22px] w-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <path d="M7 3h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
    </svg>
  ),
  indicadores: (
    <svg className="h-[22px] w-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <path d="M5 20v-6" />
      <path d="M12 20V5" />
      <path d="M19 20v-9" />
    </svg>
  ),
};

interface MobileBottomNavProps {
  activeView: ViewKey;
  availableTabs: ViewKey[];
  onViewChange: (key: ViewKey) => void;
}

export function MobileBottomNav({ activeView, availableTabs, onViewChange }: MobileBottomNavProps) {
  const renderTab = (key: ViewKey) => {
    const active = activeView === key;
    return (
      <button
        key={key}
        type="button"
        onClick={() => onViewChange(key)}
        aria-current={active ? "page" : undefined}
        className="flex min-w-0 flex-1 flex-col items-center gap-1 py-2.5 transition-colors"
      >
        <span
          className={cn(
            "flex h-8 w-12 items-center justify-center rounded-xl transition-colors",
            active ? "bg-ink text-white shadow-sm" : "text-ink-soft",
          )}
        >
          {VIEW_ICONS[key]}
        </span>
        <span
          className={cn(
            "max-w-full truncate text-[10px] font-semibold leading-none",
            active ? "text-ink" : "text-ink-muted",
          )}
        >
          {VIEW_LABELS[key]}
        </span>
      </button>
    );
  };

  return (
    <>
      <nav
        aria-label="Vistas"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
        data-tour="vistas"
      >
        <div className="flex items-stretch">
          {availableTabs.map(renderTab)}
        </div>
      </nav>

      <button
        type="button"
        onClick={() => emitAppEvent("pritio:newTask")}
        aria-label="Nueva tarea"
        className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-ink text-white shadow-elevated ring-4 ring-surface-muted transition-transform active:scale-95 lg:hidden"
      >
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </>
  );
}
