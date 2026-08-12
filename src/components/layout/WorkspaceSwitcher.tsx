import { useState } from "react";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import { WorkspaceSettingsModal } from "@/components/layout/WorkspaceSettingsModal";
import type { WorkspaceType } from "@/types";

const TYPE_ORDER: WorkspaceType[] = ["personal", "family", "team"];

const TYPE_LABELS: Record<WorkspaceType, string> = {
  personal: "Personal",
  family: "Familia",
  team: "Trabajo",
};

const TYPE_COLORS: Record<WorkspaceType, string> = {
  personal: "#9B7EDC",
  family: "#4FC38A",
  team: "#5BA7D1",
};

interface WorkspaceSwitcherProps {
  open: boolean;
  onClose: () => void;
  onCreateWorkspace: (type: WorkspaceType, withTrial?: boolean) => void;
}

export function WorkspaceSwitcher({ open, onClose, onCreateWorkspace }: WorkspaceSwitcherProps) {
  const { workspaces, currentWorkspace, switchWorkspace } = useWorkspace();
  const [settingsId, setSettingsId] = useState<string | null>(null);

  const grouped = TYPE_ORDER.map((type) => ({
    type,
    label: TYPE_LABELS[type],
    list: workspaces.filter((w) => w.type === type),
  })).filter((g) => g.list.length > 0);

  const handleSelect = (id: string) => {
    switchWorkspace(id);
    onClose();
  };

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50"
        onClick={onClose}
      />
      <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-2xl border border-line bg-surface shadow-elevated">
        {grouped.map((group) => (
          <div key={group.type}>
            <div className="px-4 pb-1 pt-3 text-[11px] font-bold uppercase tracking-widest text-ink-muted">
              {group.label}
            </div>
            {group.list.map((ws) => {
              const isActive = ws.id === currentWorkspace?.id;
              return (
                <button
                  key={ws.id}
                  onClick={() => handleSelect(ws.id)}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-surface-muted",
                    isActive && "bg-surface-muted",
                  )}
                >
                  <div
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: TYPE_COLORS[ws.type] ?? "#9B7EDC" }}
                  />
                  <div className="flex-1 min-w-0">
                    <span className={cn("block truncate font-medium text-ink", isActive && "font-bold")}>
                      {ws.name}
                    </span>
                    <span className="block text-xs text-ink-muted capitalize">{ws.type}</span>
                  </div>
                  {isActive && (
                    <svg className="h-4 w-4 shrink-0 text-pritio-blue" viewBox="0 0 16 16" fill="none">
                      <path d="M13 4L6 12L3 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSettingsId(ws.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        setSettingsId(ws.id);
                      }
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink transition-colors"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
                      <path d="M8 9a1 1 0 100-2 1 1 0 000 2z" fill="currentColor" />
                      <path d="M8 5a1 1 0 100-2 1 1 0 000 2z" fill="currentColor" />
                      <path d="M8 13a1 1 0 100-2 1 1 0 000 2z" fill="currentColor" />
                    </svg>
                  </div>
                </button>
              );
            })}
          </div>
        ))}

        <div className="border-t border-line">
          <div className="px-4 pb-1 pt-3 text-[11px] font-bold uppercase tracking-widest text-ink-muted">
            Crear nuevo
          </div>
          <button
            onClick={() => onCreateWorkspace("family", true)}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-ink transition-colors hover:bg-surface-muted"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-green-100 text-green-600 shrink-0">
              <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
                <path d="M8 1V15M1 8H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <div className="flex-1">
              <span className="block font-medium">Nueva familia</span>
              <span className="block text-xs text-ink-muted">Prueba Pro gratis 14 días</span>
            </div>
            <svg className="h-4 w-4 text-ink-muted" viewBox="0 0 16 16" fill="none">
              <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            onClick={() => onCreateWorkspace("team", true)}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-ink transition-colors hover:bg-surface-muted"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-100 text-red-600 shrink-0">
              <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
                <path d="M8 1V15M1 8H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <div className="flex-1">
              <span className="block font-medium">Nuevo equipo</span>
              <span className="block text-xs text-ink-muted">Prueba Pro gratis 14 días</span>
            </div>
            <svg className="h-4 w-4 text-ink-muted" viewBox="0 0 16 16" fill="none">
              <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      {settingsId && (
        <WorkspaceSettingsModal
          workspaceId={settingsId}
          onClose={() => setSettingsId(null)}
        />
      )}
    </>
  );
}
