import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { AppIcon } from "@/components/AppIcon";
import { Funnel, Trash, PencilSimple } from "@phosphor-icons/react";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import { listUserFilters, deleteUserFilter, updateUserFilter, type UserFilter } from "@/features/inbox/filtersApi";

interface SavedFiltersProps {
  onApplyFilter: (filter: UserFilter) => void;
  activeFilterId: string | null;
  onClearFilter: () => void;
}

export function SavedFilters({ onApplyFilter, activeFilterId, onClearFilter }: SavedFiltersProps) {
  const { profile } = useWorkspace();
  const [filters, setFilters] = useState<UserFilter[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      const data = await listUserFilters(profile.id);
      setFilters(data.filter((f) => f.isActive));
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = async (id: string) => {
    try {
      await deleteUserFilter(id);
      setFilters((prev) => prev.filter((f) => f.id !== id));
      if (activeFilterId === id) onClearFilter();
    } catch {
      // non-fatal
    }
  };

  const handleToggle = async (filter: UserFilter) => {
    try {
      await updateUserFilter(filter.id, { isActive: !filter.isActive });
      setFilters((prev) =>
        prev.map((f) => (f.id === filter.id ? { ...f, isActive: !f.isActive } : f)),
      );
      if (activeFilterId === filter.id) onClearFilter();
    } catch {
      // non-fatal
    }
  };

  if (loading) {
    return (
      <div className="p-3 text-xs text-ink-muted">Cargando filtros...</div>
    );
  }

  if (filters.length === 0) {
    return (
      <div className="p-3 text-xs text-ink-muted">
        No tienes filtros guardados. Crea uno con el botón "Crear filtro".
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={onClearFilter}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
          activeFilterId === null
            ? "bg-ink text-white"
            : "text-ink-soft hover:bg-surface-muted hover:text-ink",
        )}
      >
        <AppIcon glyph={Funnel} size="sm" />
        <span className="flex-1 text-left">Todos</span>
      </button>
      {filters.map((filter) => (
        <div
          key={filter.id}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors group",
            activeFilterId === filter.id
              ? "bg-pritio-blue/10 text-pritio-blue"
              : "text-ink-soft hover:bg-surface-muted hover:text-ink",
          )}
        >
          <button
            type="button"
            onClick={() => onApplyFilter(filter)}
            className="flex-1 flex items-center gap-2 text-left"
          >
            <AppIcon glyph={Funnel} size="sm" />
            <span className="truncate">{filter.name}</span>
          </button>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={() => handleToggle(filter)}
              className="p-1 rounded text-ink-muted hover:text-ink"
              title={filter.isActive ? "Desactivar" : "Activar"}
            >
              <AppIcon glyph={PencilSimple} size="xs" />
            </button>
            <button
              type="button"
              onClick={() => handleDelete(filter.id)}
              className="p-1 rounded text-ink-muted hover:text-red-500"
              title="Eliminar"
            >
              <AppIcon glyph={Trash} size="xs" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}