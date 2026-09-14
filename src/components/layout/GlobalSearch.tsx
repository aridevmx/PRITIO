import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import { usePopover } from "@/hooks/usePopover";
import { cn } from "@/lib/utils";
import { getTask } from "@/features/tasks/api";
import { TaskFormDialog } from "@/features/tasks/TaskFormDialog";
import {
  searchGlobal,
  OPEN_DOC_EVENT,
  FOCUS_MEMBER_EVENT,
  setSearchPendingTarget,
  type GlobalSearchResults,
} from "@/features/search/api";
import { emitAppEvent } from "@/lib/appEvents";
import type { Task } from "@/types";

type Hit = {
  key: string;
  id: string;
  workspaceId: string;
  title: string;
  kind: "task" | "meeting" | "event" | "doc" | "member";
  completed?: boolean;
  date?: string | null;
  color?: string;
};

const EMPTY: GlobalSearchResults = {
  tasks: [],
  meetings: [],
  events: [],
  docs: [],
  members: [],
};

function ResultIcon({ kind, color, initial }: { kind: Hit["kind"]; color?: string; initial: string }) {
  const cls = "h-4 w-4 shrink-0";

  switch (kind) {
    case "task":
      return (
        <svg className={cn(cls, "text-pritio-blue")} viewBox="0 0 16 16" fill="none">
          <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "meeting":
      return (
        <svg className={cn(cls, "text-pritio-purple")} viewBox="0 0 16 16" fill="none">
          <circle cx="6" cy="5" r="2.2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M2.5 13c.5-2.2 2-3.2 3.5-3.2s3 1 3.5 3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="11.2" cy="6" r="1.8" stroke="currentColor" strokeWidth="1.5" />
          <path d="M9.5 13c.4-1.7 1.4-2.5 2.5-2.5 1 0 1.8.6 2.2 1.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case "event":
      return (
        <svg className={cn(cls, "text-pritio-coral")} viewBox="0 0 16 16" fill="none">
          <rect x="2.5" y="3" width="11" height="10.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M5.5 1.5V4.5M10.5 1.5V4.5M2.5 6.5h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case "doc":
      return (
        <svg className={cn(cls, "text-pritio-green")} viewBox="0 0 16 16" fill="none">
          <path d="M13.5 9.5c0 .8-.7 1.5-1.5 1.5H4l-2.5 2V3c0-.8.7-1.5 1.5-1.5h9c.8 0 1.5.7 1.5 1.5v6.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5 7h6M5 9h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );
    case "member":
      return (
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
          style={{ backgroundColor: color || "#5BA7D1" }}
        >
          {initial.toUpperCase()}
        </span>
      );
  }
}

export function GlobalSearch() {
  const { currentWorkspace, workspaces } = useWorkspace();
  const router = useNavigate();
  const { anchorRef, panelRef, open, setOpen, close, pos } = usePopover<HTMLDivElement>({
    align: "left",
    offset: 8,
  });

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResults>(EMPTY);
  const [searching, setSearching] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const requestRef = useRef(0);

  const workspaceIds = useMemo(() => {
    if (!currentWorkspace) return [];
    return workspaces
      .filter((w) => w.type === currentWorkspace.type)
      .map((w) => w.id);
  }, [currentWorkspace, workspaces]);

  const workspaceMap = useMemo(
    () => new Map(workspaces.map((w) => [w.id, w.name])),
    [workspaces],
  );

  useEffect(() => {
    const q = query.trim();
    if (!q || workspaceIds.length === 0) {
      setSearching(false);
      setResults(EMPTY);
      return;
    }
    setSearching(true);
    const token = ++requestRef.current;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const r = await searchGlobal(workspaceIds, q);
          if (token !== requestRef.current) return;
          setResults(r);
        } catch {
          if (token === requestRef.current) setResults(EMPTY);
        } finally {
          if (token === requestRef.current) setSearching(false);
        }
      })();
    }, 220);
    return () => clearTimeout(timer);
  }, [query, workspaceIds]);

  useEffect(() => setHighlightIndex(0), [query]);

  const flat = useMemo(() => {
    const rows: Hit[] = [];
    results.tasks.forEach((t) =>
      rows.push({ key: `task:${t.id}`, id: t.id, workspaceId: t.workspaceId, title: t.title, kind: "task", completed: t.completed, date: t.date }),
    );
    results.meetings.forEach((t) =>
      rows.push({ key: `meet:${t.id}`, id: t.id, workspaceId: t.workspaceId, title: t.title, kind: "meeting", completed: t.completed, date: t.date }),
    );
    results.events.forEach((t) =>
      rows.push({ key: `ev:${t.id}`, id: t.id, workspaceId: t.workspaceId, title: t.title, kind: "event", completed: t.completed, date: t.date }),
    );
    results.docs.forEach((d) =>
      rows.push({ key: `doc:${d.id}`, id: d.id, workspaceId: d.workspaceId, title: d.title, kind: "doc" }),
    );
    results.members.forEach((m) =>
      rows.push({ key: `mem:${m.id}`, id: m.id, workspaceId: m.workspaceId, title: m.name, kind: "member", color: m.color }),
    );
    return rows;
  }, [results]);

  const sections = useMemo(() => {
    const kinds: { label: string; kind: Hit["kind"] }[] = [
      { label: "Tareas", kind: "task" },
      { label: "Juntas", kind: "meeting" },
      { label: "Eventos", kind: "event" },
      { label: "Notas", kind: "doc" },
      { label: "Miembros", kind: "member" },
    ];
    return kinds.filter((s) => flat.some((h) => h.kind === s.kind));
  }, [flat]);

  const indexByKey = useMemo(() => {
    const m = new Map<string, number>();
    flat.forEach((h, i) => m.set(h.key, i));
    return m;
  }, [flat]);

  const openTask = useCallback(async (id: string) => {
    close();
    setQuery("");
    try {
      const task = await getTask(id);
      setEditingTask(task);
      setDialogOpen(true);
    } catch {
      /* silent */
    }
  }, [close]);

  const pick = useCallback(
    (hit: Hit) => {
      if (hit.kind === "task" || hit.kind === "meeting" || hit.kind === "event") {
        void openTask(hit.id);
        return;
      }
      if (hit.kind === "doc") {
        setQuery("");
        close();
        router("/notas");
        setSearchPendingTarget({ type: "doc", docId: hit.id });
        emitAppEvent(OPEN_DOC_EVENT, { docId: hit.id });
        return;
      }
      setQuery("");
      close();
      router("/cuadrantes");
      setSearchPendingTarget({ type: "member", assigneeId: hit.id });
      emitAppEvent(FOCUS_MEMBER_EVENT, { assigneeId: hit.id });
    },
    [openTask, close, router],
  );

  const showDropdown = open && query.trim().length > 0;

  return (
    <>
      <div ref={anchorRef} className="relative">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
          viewBox="0 0 16 16"
          fill="none"
        >
          <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlightIndex((i) => (flat.length ? Math.min(i + 1, flat.length - 1) : 0));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlightIndex((i) => (flat.length ? Math.max(i - 1, 0) : 0));
            } else if (e.key === "Enter") {
              const hit = flat[highlightIndex];
              if (hit) {
                e.preventDefault();
                pick(hit);
              }
            }
          }}
          placeholder="Buscar tareas, juntas, notas, miembros…"
          aria-label="Buscar en el workspace"
          aria-autocomplete="list"
          aria-expanded={showDropdown}
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded-xl border border-line bg-surface py-2 pl-9 pr-9 text-sm text-ink shadow-soft outline-none transition placeholder:text-ink-muted focus:border-pritio-blue focus:ring-2 focus:ring-pritio-blue/25"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              close();
            }}
            aria-label="Limpiar búsqueda"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-ink-muted hover:bg-surface-muted hover:text-ink"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 12 12" fill="none">
              <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      {showDropdown &&
        createPortal(
          <div
            ref={panelRef}
            data-pritio-popover="true"
            role="listbox"
            aria-label="Resultados de búsqueda"
            style={{
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              visibility: pos ? "visible" : "hidden",
            }}
            className="pritio-menu-enter fixed z-[10002] w-[min(26rem,calc(100vw-1rem))] rounded-xl border border-line bg-surface shadow-elevated"
          >
            {searching && flat.length === 0 ? (
              <div className="flex items-center gap-2 px-3 py-4 text-sm text-ink-muted">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-pritio-blue" />
                Buscando…
              </div>
            ) : flat.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-ink-muted">Sin resultados para «{query.trim()}»</p>
            ) : (
              <div className="max-h-[70vh] overflow-y-auto p-1.5">
                {sections.map((sec) => (
                  <div key={sec.kind}>
                    <p className="px-2 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                      {sec.label}
                    </p>
                    {flat
                      .filter((h) => h.kind === sec.kind)
                      .map((hit) => {
                        const idx = indexByKey.get(hit.key) ?? 0;
                        const active = idx === highlightIndex;
                        return (
                          <button
                            key={hit.key}
                            type="button"
                            role="option"
                            aria-selected={active}
                            onClick={() => pick(hit)}
                            onMouseEnter={() => setHighlightIndex(idx)}
                            className={cn(
                              "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-colors",
                              active ? "bg-surface-muted" : "hover:bg-surface-muted",
                            )}
                          >
                            <ResultIcon kind={hit.kind} color={hit.color} initial={hit.title.charAt(0)} />
                            <span className="min-w-0 flex-1 truncate text-ink">{hit.title}</span>
                            <span className="flex shrink-0 flex-col items-end gap-0.5">
                              {(hit.kind === "meeting" || hit.kind === "event") && hit.date && (
                                <span className="text-[10px] font-medium text-ink-muted">
                                  {new Date(hit.date).toLocaleDateString("es-MX", {
                                    day: "numeric",
                                    month: "short",
                                  })}
                                </span>
                              )}
                              {hit.kind === "task" && hit.completed && (
                                <span className="text-[10px] font-medium text-pritio-green">Completada</span>
                              )}
                              {workspaceMap.size > 1 && hit.workspaceId && (
                                <span className="max-w-[8rem] truncate text-[10px] font-medium text-ink-muted">
                                  {workspaceMap.get(hit.workspaceId) || ""}
                                </span>
                              )}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                ))}
              </div>
            )}
            <div className="border-t border-line px-3 py-1.5 text-[11px] text-ink-muted">
              ↑↓ navegar · Enter abrir
            </div>
          </div>,
          document.body,
        )}

      <TaskFormDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditingTask(null);
        }}
        onSaved={() => {
          setDialogOpen(false);
          setEditingTask(null);
        }}
        task={editingTask}
      />
    </>
  );
}