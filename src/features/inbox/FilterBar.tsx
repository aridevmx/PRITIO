import { useState } from "react";
import { cn } from "@/lib/utils";
import { AppIcon } from "@/components/AppIcon";
import { Funnel, Plus, MagnifyingGlass, X } from "@phosphor-icons/react";
import type { Quadrant } from "@/types";
import { QUADRANTS, QUADRANT_ORDER } from "@/features/tasks/quadrants";

export type SmartFilter = "all" | "overdue" | "today" | "noQuadrant" | "myDay" | "byWorkspace" | "byProject";

interface FilterBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  activeSmartFilter: SmartFilter;
  onSmartFilterChange: (f: SmartFilter) => void;
  onCreateFilter: () => void;
  quadrantFilter: Quadrant | null;
  onQuadrantFilterChange: (q: Quadrant | null) => void;
  taskCount: number;
}

export function FilterBar({
  searchQuery,
  onSearchChange,
  activeSmartFilter,
  onSmartFilterChange,
  onCreateFilter,
  quadrantFilter,
  onQuadrantFilterChange,
  taskCount,
}: FilterBarProps) {
  const [showQuadrantFilters, setShowQuadrantFilters] = useState(false);

  const smartFilters: { key: SmartFilter; label: string }[] = [
    { key: "all", label: "Todas" },
    { key: "overdue", label: "Vencidas" },
    { key: "today", label: "Hoy" },
    { key: "noQuadrant", label: "Sin cuadrante" },
    { key: "myDay", label: "Mi día" },
  ];

  return (
    <div className="space-y-3">
      {/* Search + Create Filter */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <AppIcon glyph={MagnifyingGlass} size="sm" className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar tareas..."
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-line bg-surface-subtle text-sm text-ink outline-none placeholder:text-ink-muted focus:border-pritio-blue focus:ring-1 focus:ring-pritio-blue/20"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
            >
              <AppIcon glyph={X} size="sm" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onCreateFilter}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-line bg-surface text-ink-soft hover:bg-surface-muted hover:text-ink transition-colors text-sm font-medium"
        >
          <AppIcon glyph={Plus} size="sm" />
          Crear filtro
        </button>
      </div>

      {/* Smart Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
          {taskCount} tareas
        </span>
        <div className="flex flex-wrap items-center gap-1.5 ml-auto">
          {smartFilters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => onSmartFilterChange(f.key)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                activeSmartFilter === f.key
                  ? "border-ink bg-ink text-white"
                  : "border-line bg-surface text-ink-soft hover:bg-surface-muted hover:text-ink",
              )}
            >
              {f.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowQuadrantFilters(!showQuadrantFilters)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-semibold transition-colors flex items-center gap-1",
              showQuadrantFilters
                ? "border-pritio-blue bg-pritio-blue/10 text-pritio-blue"
                : "border-line bg-surface text-ink-soft hover:bg-surface-muted hover:text-ink",
            )}
          >
            <AppIcon glyph={Funnel} size="xs" />
            Cuadrante
          </button>
        </div>
      </div>

      {/* Quadrant Filter Chips */}
      {showQuadrantFilters && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => onQuadrantFilterChange(null)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
              quadrantFilter === null
                ? "border-ink bg-ink text-white"
                : "border-line bg-surface text-ink-soft hover:bg-surface-muted hover:text-ink",
            )}
          >
            Todos
          </button>
          {QUADRANT_ORDER.flatMap((key) => {
            const meta = QUADRANTS[key];
            if (!meta) return [];
            return (
              <button
                key={key}
                type="button"
                onClick={() => onQuadrantFilterChange(quadrantFilter === key ? null : key)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
                  quadrantFilter === key
                    ? "border-ink bg-ink text-white"
                    : "border-line bg-surface text-ink-soft hover:bg-surface-muted hover:text-ink",
                )}
              >
                {meta.title}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}