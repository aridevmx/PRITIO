import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

const PANEL_WIDTH = 288;
const LIST_MAX_HEIGHT = "max-h-[19rem]";

type ProjectOption = { id: string; name: string; color: string };

type FlatOption =
  | { type: "inbox" }
  | { type: "project"; id: string; name: string; color: string }
  | { type: "create"; name: string };

interface ProjectPickerProps {
  /** projectId; "" = Inbox (sin proyecto). */
  value: string;
  onChange: (projectId: string) => void;
  projects: ProjectOption[];
  /** Nombre del espacio actual para agrupar (ej. "Personal", "Familia"). */
  spaceLabel?: string;
  canCreate?: boolean;
  onCreate?: (name: string) => void;
  className?: string;
}

const InboxIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 16 16" fill="none">
    <path
      d="M2.5 3.5h11v9a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-9z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M2.5 9.5h3.2l1 1.5h2.6l1-1.5h3.2"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
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

export function ProjectPicker({
  value,
  onChange,
  projects,
  spaceLabel = "Mis proyectos",
  canCreate = false,
  onCreate,
  className,
}: ProjectPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [mode, setMode] = useState<"popover" | "sheet">("popover");
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const restoreFocusRef = useRef(false);

  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setMode(mq.matches ? "sheet" : "popover");
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const q = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!q) return projects;
    return projects
      .filter((p) => p.name.toLowerCase().includes(q))
      .sort(
        (a, b) =>
          Number(b.name.toLowerCase().startsWith(q)) -
          Number(a.name.toLowerCase().startsWith(q)),
      );
  }, [projects, q]);

  const flatOptions = useMemo<FlatOption[]>(() => {
    const opts: FlatOption[] = [{ type: "inbox" }];
    filtered.forEach((p) => opts.push({ type: "project", ...p }));
    if (canCreate && onCreate && q) opts.push({ type: "create", name: q });
    return opts;
  }, [filtered, canCreate, onCreate, q]);

  const selectedProject = projects.find((p) => p.id === value) ?? null;
  const listId = "project-picker-list";
  const emptyState = projects.length === 0 ? "empty-workspace" : "no-results";

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
      const width = panelRef.current?.offsetWidth || PANEL_WIDTH;
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

  const selectOption = (o: FlatOption) => {
    if (o.type === "inbox") onChange("");
    else if (o.type === "project") onChange(o.id);
    else onCreate?.(o.name);
    setQuery("");
    setOpen(false);
  };

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

  const optionClass = (active: boolean, selected: boolean) =>
    cn(
      "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
      active
        ? "bg-pritio-blue/10 text-ink"
        : selected
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
        aria-label="Proyecto"
        className={cn(
          "flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors",
          open
            ? "border-pritio-blue ring-1 ring-pritio-blue/20"
            : selectedProject
              ? "border-line bg-surface-subtle text-ink hover:border-line-strong"
              : "border-dashed border-line-strong/70 bg-surface-subtle/50 text-ink-muted hover:border-pritio-blue/40",
        )}
      >
        {selectedProject ? (
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: selectedProject.color }}
          />
        ) : (
          <InboxIcon className="h-4 w-4 shrink-0 text-ink-muted" />
        )}
        <span className="min-w-0 flex-1 truncate">
          {selectedProject ? selectedProject.name : "Inbox"}
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
                  placeholder="Buscar proyecto…"
                  aria-label="Buscar proyecto"
                  role="combobox"
                  aria-expanded={open}
                  aria-controls={listId}
                  aria-activedescendant={flatOptions[highlight] ? `project-picker-opt-${highlight}` : undefined}
                  className="w-full rounded-lg border border-line bg-surface-subtle py-2 pl-8 pr-2.5 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-pritio-blue focus:ring-1 focus:ring-pritio-blue/20 [&::-webkit-search-cancel-button]:hidden"
                />
              </div>

              <div id={listId} role="listbox" aria-label="Proyectos" className={cn("mt-1.5", LIST_MAX_HEIGHT, "overflow-y-auto pr-0.5")}>
                <button
                  type="button"
                  role="option"
                  id={`project-picker-opt-0`}
                  data-hlid="0"
                  aria-selected={!value}
                  onMouseEnter={() => setHighlight(0)}
                  onClick={() => selectOption(flatOptions[0])}
                  className={optionClass(highlight === 0 && flatOptions[0]?.type !== "create", !value)}
                >
                  <InboxIcon className="h-4 w-4 shrink-0 text-ink-muted" />
                  <span className={cn("min-w-0 flex-1 truncate text-sm", !value ? "font-medium text-ink" : "text-ink-soft")}>
                    Inbox
                  </span>
                  {!value && <CheckIcon className="h-3.5 w-3.5 shrink-0 text-pritio-blue" />}
                </button>

                {filtered.length > 0 && (
                  <>
                    <div className="mx-2 my-1.5 flex items-center gap-2">
                      <span className="h-px flex-1 bg-line" />
                      <p className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                        {spaceLabel}
                      </p>
                      <span className="h-px flex-1 bg-line" />
                    </div>
                    {filtered.map((p, i) => {
                      const idx = i + 1;
                      const selected = value === p.id;
                      const active = highlight === idx;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          role="option"
                          id={`project-picker-opt-${idx}`}
                          data-hlid={idx}
                          aria-selected={selected}
                          onMouseEnter={() => setHighlight(idx)}
                          onClick={() => selectOption(flatOptions[idx])}
                          className={optionClass(active, selected)}
                        >
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                          <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                          {selected && <CheckIcon className="h-3.5 w-3.5 shrink-0 text-pritio-blue" />}
                        </button>
                      );
                    })}
                  </>
                )}

                {filtered.length === 0 && projects.length === 0 && (
                  <p className="px-2 py-2 text-xs text-ink-muted">Aún no hay proyectos.</p>
                )}
                {filtered.length === 0 && projects.length > 0 && (
                  <p className="px-2 py-2 text-xs text-ink-muted">No encontramos proyectos.</p>
                )}

                {canCreate && onCreate && q && (
                  <button
                    type="button"
                    role="option"
                    id="project-picker-create"
                    data-hlid={flatOptions.length - 1}
                    aria-selected={false}
                    onMouseEnter={() => setHighlight(flatOptions.length - 1)}
                    onClick={() => selectOption(flatOptions[flatOptions.length - 1])}
                    className={cn(
                      "mt-1.5 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
                      highlight === flatOptions.length - 1 && flatOptions[flatOptions.length - 1]?.type === "create"
                        ? "bg-pritio-blue/10 text-pritio-blue"
                        : "text-pritio-blue hover:bg-pritio-blue/5",
                    )}
                  >
                    <svg className="h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="none">
                      <path d="M8 1V15M1 8H15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      Crear proyecto "{query.trim()}"
                    </span>
                  </button>
                )}

                {emptyState === "no-results" && canCreate && !q && (
                  <p className="px-2 pb-1 pt-2 text-[11px] text-ink-muted">
                    Escribe para buscar o crear un nuevo proyecto.
                  </p>
                )}
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}