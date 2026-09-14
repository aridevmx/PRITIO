import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type AssigneeOption = { id: string; name: string };

type FlatOption = { type: "clear" } | { type: "assignee"; id: string; name: string };

interface AssigneePickerProps {
  /** ids seleccionados (multi-selección). */
  value: string[];
  onChange: (ids: string[]) => void;
  onToggle: (id: string) => void;
  assignees: AssigneeOption[];
  /** ids cuya selección no se puede quitar (miembro auto-asignado bloqueado). */
  lockedIds?: ReadonlySet<string>;
  /** ids visibles; null = todos. */
  allowedIds?: ReadonlySet<string> | null;
  /** Título del grupo en la lista. */
  groupLabel?: string;
  emptyLabel?: string;
  className?: string;
}

const UsersIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 16 16" fill="none">
    <circle cx="6" cy="5" r="2.2" stroke="currentColor" strokeWidth="1.5" />
    <path d="M2.5 13c.5-2.2 2-3.2 3.5-3.2s3 1 3.5 3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="11.2" cy="6" r="1.8" stroke="currentColor" strokeWidth="1.5" />
    <path d="M9.5 13c.4-1.7 1.4-2.5 2.5-2.5 1 0 1.8.6 2.2 1.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const CheckIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 16 16" fill="none">
    <path
      d="M3.5 8.5l3 3 6-6"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export function AssigneePicker({
  value,
  onChange,
  onToggle,
  assignees,
  lockedIds,
  allowedIds = null,
  groupLabel = "Miembros",
  emptyLabel = "Sin asignar",
  className,
}: AssigneePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [mode, setMode] = useState<"popover" | "sheet">("popover");
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const restoreFocusRef = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setMode(mq.matches ? "sheet" : "popover");
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const q = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    const visible = allowedIds
      ? assignees.filter((a) => allowedIds.has(a.id))
      : assignees;
    if (!q) return visible;
    return visible
      .filter((a) => a.name.toLowerCase().includes(q))
      .sort(
        (a, b) =>
          Number(b.name.toLowerCase().startsWith(q)) -
          Number(a.name.toLowerCase().startsWith(q)),
      );
  }, [assignees, allowedIds, q]);

  const flatOptions = useMemo<FlatOption[]>(() => {
    const opts: FlatOption[] = [{ type: "clear" }];
    filtered.forEach((a) => opts.push({ type: "assignee", id: a.id, name: a.name }));
    return opts;
  }, [filtered]);

  const selected = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    value.forEach((id) => {
      const a = assignees.find((x) => x.id === id);
      if (a) map.set(id, a);
    });
    return [...map.values()];
  }, [value, assignees]);

  const listId = "assignee-picker-list";

  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => searchRef.current?.focus(), 0);
    setHighlight(0);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (open) return;
    if (restoreFocusRef.current) {
      btnRef.current?.focus();
      restoreFocusRef.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (btnRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      close();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || mode === "sheet") {
      setPos(null);
      return;
    }
    const update = () => {
      const rect = btnRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = panelRef.current?.offsetWidth || 288;
      let left = rect.right - width;
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
      const height = panelRef.current?.offsetHeight ?? 0;
      let top = rect.bottom + 6;
      if (height > 0 && top + height > window.innerHeight - 8) {
        top = Math.max(8, Math.min(rect.top - height - 6, window.innerHeight - height - 8));
      }
      setPos({ top, left });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, mode]);

  useEffect(() => {
    if (!open) return;
    const el = panelRef.current?.querySelector<HTMLElement>(`[data-hlid="${highlight}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [highlight, open]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, flatOptions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = flatOptions[highlight];
      if (o) selectOption(o);
    }
  }

  const selectOption = (o: FlatOption) => {
    if (o.type === "clear") {
      onChange([]);
      setQuery("");
    } else {
      onToggle(o.id);
    }
    setOpen(false);
  };

  const triggerSummary = selected.length > 0 ? selected.map((a) => a.name).slice(0, 2).join(", ") : emptyLabel;
  const triggerCount = selected.length > 2 ? selected.length - 2 : 0;

  const optionClass = (active: boolean, checked: boolean, disabled: boolean) =>
    cn(
      "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
      disabled
        ? "cursor-not-allowed opacity-60"
        : active
          ? "bg-pritio-blue/10 text-ink"
          : checked
            ? "bg-pritio-blue/5 text-ink"
            : "text-ink hover:bg-surface-muted",
    );

  return (
    <div className={className}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => {
          if (!open) restoreFocusRef.current = true;
          setOpen((v) => !v);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Asignados"
        className={cn(
          "flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors",
          open
            ? "border-pritio-blue ring-1 ring-pritio-blue/20"
            : selected.length > 0
              ? "border-line bg-surface-subtle text-ink hover:border-line-strong"
              : "border-dashed border-line-strong/70 bg-surface-subtle/50 text-ink-muted hover:border-pritio-blue/40",
        )}
      >
        {selected.length > 0 ? (
          <span className="flex -space-x-1.5 shrink-0">
            {selected.slice(0, 3).map((a) => (
              <span
                key={a.id}
                className="grid h-5 w-5 place-items-center rounded-full bg-pritio-blue text-[9px] font-bold text-white ring-2 ring-surface"
              >
                {initialsOf(a.name)}
              </span>
            ))}
          </span>
        ) : (
          <UsersIcon className="h-4 w-4 shrink-0 text-ink-muted" />
        )}
        <span className="min-w-0 flex-1 truncate">
          {triggerSummary}
          {triggerCount > 0 && <span className="text-ink-muted"> +{triggerCount}</span>}
        </span>
        <svg
          className={cn(
            "h-3 w-3 shrink-0 text-ink-muted transition-transform duration-200",
            open && "rotate-180",
          )}
          viewBox="0 0 16 16"
          fill="none"
        >
          <path
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open &&
        createPortal(
          <>
            {mode === "sheet" && <div className="fixed inset-0 z-[10001] bg-ink/25" aria-hidden="true" />}
            <div
              ref={panelRef}
              data-pritio-popover="true"
              style={
                mode === "popover"
                  ? { top: pos?.top ?? -9999, left: pos?.left ?? -9999, visibility: pos ? "visible" : "hidden" }
                  : undefined
              }
              className={cn(
                "pritio-menu-enter fixed z-[10002] border border-line bg-surface shadow-elevated",
                mode === "popover"
                  ? "w-[18rem] max-w-[calc(100vw-1rem)] rounded-xl p-1.5"
                  : "inset-x-0 bottom-0 rounded-t-2xl p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]",
              )}
            >
              <div className={cn(mode === "sheet" && "mx-auto mb-2 h-1 w-10 rounded-full bg-line-strong")} />

              <div className="relative">
                <svg
                  className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted"
                  viewBox="0 0 16 16"
                  fill="none"
                >
                  <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setHighlight(0);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Buscar asignado…"
                  aria-label="Buscar asignado"
                  role="combobox"
                  aria-expanded={open}
                  aria-controls={listId}
                  aria-activedescendant={flatOptions[highlight] ? `assignee-picker-opt-${highlight}` : undefined}
                  className="w-full rounded-lg border border-line bg-surface-subtle py-2 pl-8 pr-2.5 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-pritio-blue focus:ring-1 focus:ring-pritio-blue/20 [&::-webkit-search-cancel-button]:hidden"
                />
              </div>

              <div id={listId} role="listbox" aria-label="Asignados" className="mt-1.5 max-h-[19rem] overflow-y-auto pr-0.5">
                <button
                  type="button"
                  role="option"
                  id="assignee-picker-opt-0"
                  data-hlid="0"
                  aria-selected={value.length === 0}
                  onMouseEnter={() => setHighlight(0)}
                  onClick={() => selectOption(flatOptions[0])}
                  className={optionClass(highlight === 0, value.length === 0, false)}
                >
                  <UsersIcon className="h-4 w-4 shrink-0 text-ink-muted" />
                  <span className={cn("min-w-0 flex-1 truncate text-sm", value.length === 0 ? "font-medium text-ink" : "text-ink-soft")}>
                    {emptyLabel}
                  </span>
                  {value.length === 0 && <CheckIcon className="h-3.5 w-3.5 shrink-0 text-pritio-blue" />}
                </button>

                {filtered.length > 0 && (
                  <>
                    <div className="mx-2 my-1.5 flex items-center gap-2">
                      <span className="h-px flex-1 bg-line" />
                      <p className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">{groupLabel}</p>
                      <span className="h-px flex-1 bg-line" />
                    </div>
                    {filtered.map((a, i) => {
                      const idx = i + 1;
                      const checked = value.includes(a.id);
                      const locked = Boolean(checked && lockedIds?.has(a.id));
                      return (
                        <button
                          key={a.id}
                          type="button"
                          role="option"
                          id={`assignee-picker-opt-${idx}`}
                          data-hlid={idx}
                          aria-selected={checked}
                          disabled={locked}
                          title={
                            locked
                              ? "Los miembros solo pueden asignarse tareas a sí mismos."
                              : undefined
                          }
                          onMouseEnter={() => setHighlight(idx)}
                          onClick={() => selectOption(flatOptions[idx])}
                          className={optionClass(highlight === idx, checked, locked)}
                        >
                          <span
                            className={cn(
                              "grid h-5 w-5 shrink-0 place-items-center rounded-full text-[9px] font-bold",
                              checked ? "bg-pritio-blue text-white" : "bg-surface-muted text-ink-soft",
                            )}
                          >
                            {initialsOf(a.name)}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm">{a.name}</span>
                          {checked && <CheckIcon className="h-3.5 w-3.5 shrink-0 text-pritio-blue" />}
                        </button>
                      );
                    })}
                  </>
                )}

                {filtered.length === 0 && (
                  <p className="px-2 py-2 text-xs text-ink-muted">No encontramos asignados.</p>
                )}
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}