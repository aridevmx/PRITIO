import { useRef, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import type { WorkspaceType } from "@/types";

const wsColorMap: Record<string, string> = {
  personal: "#9B7EDC",
  family: "#4FC38A",
  team: "#5BA7D1",
};

const TYPE_LABELS: Record<WorkspaceType, string> = {
  personal: "Personal",
  family: "Familia",
  team: "Trabajo",
};

const TYPE_ORDER: WorkspaceType[] = ["personal", "family", "team"];

interface WorkspaceSelectorProps {
  currentWorkspace: {
    id: string;
    name: string;
    type: WorkspaceType;
  };
  workspaces: {
    id: string;
    name: string;
    type: WorkspaceType;
  }[];
  isOpen: boolean;
  onClose: () => void;
  onOpenChange: (open: boolean) => void;
}

export function WorkspaceSelector({
  currentWorkspace,
  workspaces,
  isOpen,
  onClose,
  onOpenChange,
}: WorkspaceSelectorProps) {
  const { switchWorkspace, createWorkspace } = useWorkspace();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(e: MouseEvent) {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        menuRef.current &&
        !menuRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen, onClose]);

  const groupedWorkspaces = useMemo(() => {
    return TYPE_ORDER.map((type) => ({
      type,
      label: TYPE_LABELS[type],
      list: workspaces.filter((w) => w.type === type),
    })).filter((g) => g.list.length > 0);
  }, [workspaces]);

  const handleSelectWorkspace = (id: string) => {
    switchWorkspace(id);
    onClose();
  };

  const handleCreateWorkspace = async (type: WorkspaceType, withTrial?: boolean) => {
    const name = type === "family" ? "Familia" : "Equipo";
    try {
      const ws = await createWorkspace(name, type);
      if (withTrial && (type === "family" || type === "team")) {
        const { startProTrial } = await import("@/features/billing/api");
        await startProTrial(ws.id);
      }
      switchWorkspace(ws.id);
    } catch (err) {
      console.error("Failed to create workspace:", err);
    }
  };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => onOpenChange(!isOpen)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label="Cambiar workspace"
        className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-1.5 text-left transition-colors hover:border-line-strong hover:bg-surface-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pritio-purple/40"
      >
        <div
          className="h-2 w-2 rounded-full shrink-0"
          style={{ backgroundColor: wsColorMap[currentWorkspace.type] ?? "#9B7EDC" }}
          aria-hidden
        />
        <span className="text-sm font-semibold text-ink">
          {currentWorkspace.name}
        </span>
        <svg
          className={cn(
            "ml-auto h-3.5 w-3.5 text-ink-muted transition-transform duration-200",
            isOpen && "rotate-180",
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          className="absolute right-0 top-full z-[100] mt-1.5 w-56 origin-top-right rounded-xl border border-line bg-surface shadow-elevated ring-1 ring-line/20 overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150"
          role="menu"
        >
          <div className="p-1.5">
            {groupedWorkspaces.map((group) => (
              <div key={group.type}>
                <div className="px-2 pb-1 pt-2 text-[11px] font-bold uppercase tracking-widest text-ink-muted">
                  {group.label}
                </div>
                {group.list.map((ws) => (
                  <button
                    key={ws.id}
                    type="button"
                    role="menuitem"
                    onClick={() => handleSelectWorkspace(ws.id)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-left transition-colors",
                      ws.id === currentWorkspace.id
                        ? "bg-surface-muted text-ink"
                        : "text-ink-muted hover:bg-surface-muted hover:text-ink-soft",
                    )}
                  >
                    <div className={cn("h-2 w-2 rounded-full shrink-0", wsColorMap[ws.type])} />
                    <span className="truncate">{ws.name}</span>
                    {ws.id === currentWorkspace.id && (
                      <svg className="ml-auto h-3.5 w-3.5 text-pritio-blue" viewBox="0 0 16 16" fill="none">
                        <path d="M13 4L6 12L3 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div className="border-t border-line p-1.5">
            <button
              type="button"
              onClick={() => handleCreateWorkspace("family", true)}
              className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-surface-muted"
            >
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-green-100 text-green-600 shrink-0">
                <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none">
                  <path d="M8 1V15M1 8H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <span className="font-medium">Nueva familia</span>
              <span className="ml-auto text-xs text-ink-muted">Prueba Pro 14 días</span>
            </button>
            <button
              type="button"
              onClick={() => handleCreateWorkspace("team", true)}
              className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-surface-muted"
            >
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-red-100 text-red-600 shrink-0">
                <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none">
                  <path d="M8 1V15M1 8H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <span className="font-medium">Nuevo equipo</span>
              <span className="ml-auto text-xs text-ink-muted">Prueba Pro 14 días</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}