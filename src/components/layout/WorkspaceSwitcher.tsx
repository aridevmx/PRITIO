import { useState } from "react";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import { WorkspaceSettingsModal } from "@/components/layout/WorkspaceSettingsModal";
import { AppIcon } from "@/components/AppIcon";
import { CaretRight, Check, DotsThreeVertical, Plus } from "@phosphor-icons/react";
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
                    <AppIcon glyph={Check} className="shrink-0 text-pritio-blue" />
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
                    <AppIcon glyph={DotsThreeVertical} size="sm" />
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
              <AppIcon glyph={Plus} size="sm" />
            </div>
            <div className="flex-1">
              <span className="block font-medium">Nueva familia</span>
              <span className="block text-xs text-ink-muted">Prueba Pro gratis 14 días</span>
            </div>
            <AppIcon glyph={CaretRight} className="text-ink-muted" />
          </button>
          <button
            onClick={() => onCreateWorkspace("team", true)}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-ink transition-colors hover:bg-surface-muted"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-100 text-red-600 shrink-0">
              <AppIcon glyph={Plus} size="sm" />
            </div>
            <div className="flex-1">
              <span className="block font-medium">Nuevo equipo</span>
              <span className="block text-xs text-ink-muted">Prueba Pro gratis 14 días</span>
            </div>
            <AppIcon glyph={CaretRight} className="text-ink-muted" />
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
