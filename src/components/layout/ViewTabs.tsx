import { cn } from "@/lib/utils";

export type ViewKey =
  | "cuadrantes"
  | "plan"
  | "calendario"
  | "kanban"
  | "indicadores";

const ALL_TABS: { key: ViewKey; label: string }[] = [
  { key: "cuadrantes", label: "Cuadrantes" },
  { key: "plan", label: "Plan" },
  { key: "kanban", label: "Tablero" },
  { key: "calendario", label: "Calendario" },
  { key: "indicadores", label: "Indicadores" },
];

interface ViewTabsProps {
  active: ViewKey;
  onChange: (key: ViewKey) => void;
  availableTabs?: ViewKey[];
}

export function ViewTabs({ active, onChange, availableTabs }: ViewTabsProps) {
  const tabs = availableTabs
    ? ALL_TABS.filter((t) => availableTabs.includes(t.key))
    : ALL_TABS;

  return (
    <div className="flex items-center gap-1 rounded-full bg-surface-muted p-1" data-tour="vistas">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={cn(
            "rounded-full px-4 py-1.5 text-sm font-medium transition-all",
            active === tab.key
              ? "bg-ink text-white shadow-sm"
              : "text-ink-soft hover:text-ink",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
