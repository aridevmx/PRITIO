import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import { useToast } from "@/components/Toast";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import { stripHtml } from "@/lib/utils";
import { listDocs, createDoc, listFolders, createFolder, buildDocTree, updateDoc, deleteDoc, listTags, createTag, listTagIdsForDoc, linkDocTag, unlinkDocTag, type DocTag } from "@/features/docs/api";
import { DocsTree } from "@/features/docs/DocsTree";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ShareDialog } from "@/features/docs/ShareDialog";
import {
  buildStandaloneHtml,
  downloadFile,
  htmlToMarkdown,
  printStandaloneHtml,
  safeFileName,
} from "@/features/docs/exportUtils";
import { isOnline, loadSnapshot, saveSnapshot } from "@/lib/offline";
import { onAppEvent } from "@/lib/appEvents";
import { takeSearchPendingTarget, OPEN_DOC_EVENT } from "@/features/search/api";
import type { Doc, DocFolder } from "@/features/docs/api";

/* El editor rico (Tiptap) se carga solo al abrir la sección de notas. */
const RichTextEditor = lazy(() =>
  import("@/components/RichTextEditor").then((m) => ({ default: m.RichTextEditor })),
);

function formatUpdated(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "ayer";
  return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

type ExportFormat = "md" | "html" | "docx" | "pdf";

const TAG_PALETTE = [
  "#5BA7D1",
  "#4FC38A",
  "#F27D72",
  "#9B7EDC",
  "#F59E0B",
  "#EC4899",
  "#14B8A6",
  "#6366F1",
];

function folderPath(folders: DocFolder[], folderId: string | null): DocFolder[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path: DocFolder[] = [];
  let cur = folderId ? byId.get(folderId) : undefined;
  while (cur) {
    path.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return path;
}

interface DocsGlobalViewProps {
  workspaceIds: string[];
}

export function DocsGlobalView({ workspaceIds }: DocsGlobalViewProps) {
  const { profile } = useWorkspace();
  const { toast } = useToast();

  const [docs, setDocs] = useState<Doc[]>([]);
  const [folders, setFolders] = useState<DocFolder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const pendingDocIdRef = useRef<string | null>(null);

  // Autosave del editor
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const saveTimer = useRef<number | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const pendingRef = useRef<{ title?: string; content?: string | null }>({});
  const docsRef = useRef<Doc[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const selectedDoc = useMemo(() => docs.find((d) => d.id === selectedId) ?? null, [docs, selectedId]);

  useEffect(() => {
    docsRef.current = docs;
  }, [docs]);

  // ─── Menú "⋯" (compartir / descargar / eliminar) ─────────
const menuRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    if (!menuOpen && !exportOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setExportOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen, exportOpen]);

  useEffect(() => {
    if (!menuOpen || !btnRef.current) return;

    const updatePosition = () => {
      const rect = btnRef.current!.getBoundingClientRect();
      const menuWidth = 224; // w-56 = 224px
      const viewportWidth = window.innerWidth;
      const left = Math.min(rect.right - menuWidth, viewportWidth - menuWidth - 16);
      setMenuPosition({
        top: rect.bottom + 6, // mt-1.5 = 6px
        left: Math.max(left, 16),
        width: menuWidth,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [menuOpen]);

  // ─── Etiquetas (#) ────────────────────────────────────────
  const [tagsByWs, setTagsByWs] = useState<Record<string, DocTag[]>>({});
  const [docTagIds, setDocTagIds] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  const tagsById = useMemo(() => {
    const map = new Map<string, DocTag>();
    Object.values(tagsByWs).forEach((list) => list.forEach((t) => map.set(t.id, t)));
    return map;
  }, [tagsByWs]);

  const selectedDocTags = useMemo(
    () => docTagIds.map((id) => tagsById.get(id)).filter((t): t is DocTag => Boolean(t)),
    [docTagIds, tagsById],
  );

  useEffect(() => {
    setDocTagIds([]);
    setTagInput("");
    if (!selectedDoc) return;
    const ws = selectedDoc.workspaceId;
    if (!tagsByWs[ws]) {
      void listTags(ws)
        .then((rows) => setTagsByWs((prev) => ({ ...prev, [ws]: rows })))
        .catch(() => {});
    }
    void listTagIdsForDoc(selectedDoc.id)
      .then((ids) => setDocTagIds(ids))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresco al cambiar de doc
  }, [selectedDoc?.id]);

  const linkTagByName = useCallback(
    async (name: string) => {
      if (!selectedDoc || !profile) return;
      const clean = name.replace(/^#+/, "").trim();
      if (!clean) return;
      const ws = selectedDoc.workspaceId;
      const workspaceTags = tagsByWs[ws] ?? [];
      let tag = workspaceTags.find((t) => t.name.toLowerCase() === clean.toLowerCase());
      if (!tag) {
        const color = TAG_PALETTE[workspaceTags.length % TAG_PALETTE.length];
        try {
          tag = await createTag(ws, profile.id, clean, color);
          setTagsByWs((prev) => ({ ...prev, [ws]: [...(prev[ws] ?? []), tag!].sort((a, b) => a.name.localeCompare(b.name)) }));
        } catch {
          return;
        }
      }
      if (!docTagIds.includes(tag.id)) {
        setDocTagIds((prev) => [...prev, tag.id]);
        void linkDocTag(selectedDoc.id, tag.id, ws).catch(() => {
          setDocTagIds((prev) => prev.filter((id) => id !== tag.id));
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast estable
    [selectedDoc?.id, selectedDoc?.workspaceId, profile, tagsByWs, docTagIds],
  );

  const handleTagInputChange = useCallback(
    (raw: string) => {
      const sanitized = raw.replace(/[^#\w\sáéíóúñüÁÉÍÓÚÑÜ-]+/g, "").slice(0, 120);
      setTagInput(sanitized);
      const parts = sanitized.split(",").map((p) => p.trim()).filter(Boolean);
      if (parts.length === 0) return;
      const endsWithComma = sanitized.endsWith(",");
      if (endsWithComma || parts.length > 1) {
        const toCommit = endsWithComma ? parts : parts.slice(0, -1);
        if (toCommit.length) {
          setTagInput("");
          void Promise.all(toCommit.map((p) => linkTagByName(p)));
        }
      }
    },
    [linkTagByName],
  );

  const handleTagKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const parts = tagInput.split(",").map((p) => p.trim()).filter(Boolean);
        setTagInput("");
        void Promise.all(parts.map((p) => linkTagByName(p)));
      }
    },
    [tagInput, linkTagByName],
  );

  const removeTag = useCallback(
    async (tagId: string) => {
      if (!selectedDoc) return;
      setDocTagIds((prev) => prev.filter((id) => id !== tagId));
      try {
        await unlinkDocTag(selectedDoc.id, tagId);
      } catch {
        setDocTagIds((prev) => [...prev, tagId]);
      }
    },
    [selectedDoc],
  );

  const fetchAll = useCallback(async () => {
    if (workspaceIds.length === 0) {
      setDocs([]);
      setFolders([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      if (!isOnline()) {
        const snap = await loadSnapshot<{ docs: Doc[]; folders: DocFolder[] }>(`docs:global:${workspaceIds.join(",")}`);
        if (snap) {
          setDocs(snap.data.docs);
          setFolders(snap.data.folders);
          setIsLoading(false);
          return;
        }
      }
      const [docRows, folderRows] = await Promise.all([
        Promise.all(workspaceIds.map((id) => listDocs(id))).then((lists) => lists.flat()),
        Promise.all(workspaceIds.map((id) => listFolders(id))).then((lists) => lists.flat()),
      ]);
      setDocs(docRows);
      setFolders(folderRows);
      if (isOnline()) {
        void saveSnapshot(`docs:global:${workspaceIds.join(",")}`, { docs: docRows, folders: folderRows });
      }
    } catch {
      toast.error("No se pudieron cargar los documentos");
    } finally {
      setIsLoading(false);
    }
  }, [workspaceIds, toast]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    const pending = takeSearchPendingTarget();
    if (pending?.type === "doc") {
      pendingDocIdRef.current = pending.docId;
      setSelectedId(pending.docId);
    }
    return onAppEvent<{ docId: string }>(OPEN_DOC_EVENT, (payload) => {
      if (payload && typeof payload.docId === "string") {
        pendingDocIdRef.current = payload.docId;
        setSelectedId(payload.docId);
      }
    });
  }, []);

  useEffect(() => {
    const id = pendingDocIdRef.current;
    if (!id) return;
    const doc = docs.find((d) => d.id === id);
    if (!doc) return;
    const toExpand = new Set<string>();
    const folderMap = new Map(folders.map((f) => [f.id, f.parentId]));
    let parentId = doc.parentFolderId;
    while (parentId) {
      toExpand.add(parentId);
      parentId = folderMap.get(parentId) ?? null;
    }
    if (toExpand.size) {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        toExpand.forEach((x) => next.add(x));
        return next;
      });
    }
    pendingDocIdRef.current = null;
  }, [docs, folders]);

  // ─── Autosave del editor ──────────────────────────────────

  useEffect(() => {
    activeIdRef.current = selectedId;
  }, [selectedId]);

  const flushSave = useCallback(async () => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const patch = pendingRef.current;
    const id = activeIdRef.current;
    pendingRef.current = {};
    if (!id || Object.keys(patch).length === 0) return;
    try {
      await updateDoc(id, patch);
      setDocs((prev) =>
        prev.map((d) =>
          d.id === id ? { ...d, ...patch, updatedAt: new Date().toISOString() } : d,
        ),
      );
    } catch {
      toast.error("No se pudo guardar la nota");
    }
  }, [toast]);

  useEffect(
    () => () => {
      void flushSave();
    },
    [flushSave],
  );

  const queueSave = useCallback(
    (patch: { title?: string; content?: string | null }) => {
      if (!selectedId) return;
      pendingRef.current = { ...pendingRef.current, ...patch };
      setSaveState("saving");
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        saveTimer.current = null;
        void flushSave().then(() => setSaveState("saved"));
      }, 800);
    },
    [selectedId, flushSave],
  );

  const handleSelectDoc = useCallback(
    (id: string) => {
      void flushSave().then(() => setSelectedId(id));
    },
    [flushSave],
  );

  const handleBackToTree = useCallback(() => {
    void flushSave().then(() => setSelectedId(null));
  }, [flushSave]);

  const handleDelete = async () => {
    if (!selectedDoc) return;
    try {
      await deleteDoc(selectedDoc.id);
      setDocs((prev) => prev.filter((d) => d.id !== selectedDoc.id));
      setSelectedId(null);
      setConfirmDelete(false);
      toast.success("Nota eliminada");
    } catch {
      toast.error("No se pudo eliminar la nota");
    }
  };

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      if (!selectedDoc) return;
      setMenuOpen(false);
      setExportOpen(false);
      try {
        await flushSave();
        const name = safeFileName(selectedDoc.title, format === "md" ? "md" : format);
        if (format === "md") {
          downloadFile(name, "text/markdown", htmlToMarkdown(selectedDoc.content));
        } else if (format === "html") {
          downloadFile(name, "text/html", buildStandaloneHtml(selectedDoc.title, selectedDoc.content));
        } else if (format === "pdf") {
          printStandaloneHtml(buildStandaloneHtml(selectedDoc.title, selectedDoc.content));
        } else {
          setExporting("docx");
          const { exportDocx } = await import("@/features/docs/exportDocx");
          await exportDocx(selectedDoc.title, selectedDoc.content, name);
        }
      } catch {
        toast.error("No se pudo exportar el documento");
      } finally {
        setExporting(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- helpers/refs estables
    [selectedDoc?.id, selectedDoc?.title, selectedDoc?.content, flushSave],
  );

  const handleCreate = useCallback(
    async (parentFolderId: string | null = null) => {
      if (!profile) return;
      await flushSave();
      try {
        const doc = await createDoc(workspaceIds[0], profile.id, "", parentFolderId, null);
        setDocs((prev) => [doc, ...prev]);
        if (parentFolderId) {
          setExpandedIds((prev) => new Set(prev).add(parentFolderId));
        }
        setSelectedId(doc.id);
      } catch {
        toast.error("No se pudo crear el documento");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setters estables
    [profile, workspaceIds, flushSave],
  );

  const handleCreateFolder = useCallback(
    async (parentId: string | null = null) => {
      if (!profile) return;
      try {
        const folder = await createFolder(workspaceIds[0], profile.id, "Carpeta sin título", parentId);
        setFolders((prev) => [...prev, folder]);
        if (parentId) setExpandedIds((prev) => new Set(prev).add(parentId));
      } catch {
        toast.error("No se pudo crear la carpeta");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setters estables
    [profile, workspaceIds],
  );

  // El "+" flotante dispara la creación de nota / carpeta desde cualquier lugar.
  useEffect(() => {
    const onCreateDoc = () => void handleCreate(null);
    const onCreateFolder = () => void handleCreateFolder(null);
    window.addEventListener("pritio:create-doc", onCreateDoc);
    window.addEventListener("pritio:create-folder", onCreateFolder);
    return () => {
      window.removeEventListener("pritio:create-doc", onCreateDoc);
      window.removeEventListener("pritio:create-folder", onCreateFolder);
    };
  }, [handleCreate, handleCreateFolder]);

  const filteredDocs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter((d) => {
      const inTitle = d.title.toLowerCase().includes(q);
      const inContent = stripHtml(d.content).toLowerCase().includes(q);
      return inTitle || inContent;
    });
  }, [docs, search]);

  const tree = useMemo(() => buildDocTree(folders, filteredDocs), [folders, filteredDocs]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden p-4 lg:p-8">
      <div className="mb-4 flex items-center gap-3">
        <div className="relative min-w-0 max-w-xs flex-1">
          <AppIcon
            glyph={MagnifyingGlass}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar documentos…"
            className="w-full rounded-xl border border-line bg-surface px-9 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-pritio-blue focus:outline-none focus:ring-2 focus:ring-pritio-blue/20"
          />
        </div>
        <button
          type="button"
          onClick={() => void handleCreateFolder(null)}
          disabled={isLoading}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-semibold text-ink transition-colors hover:border-line-strong hover:bg-surface-subtle disabled:opacity-50"
        >
          <AppIcon glyph={FolderPlus} />
          Carpeta
        </button>
        <button
          type="button"
          onClick={() => handleCreate(null)}
          disabled={isLoading}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-ink px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-ink/90 disabled:opacity-50"
        >
          <AppIcon glyph={Plus} />
          Nueva nota
        </button>
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-ink-muted">Cargando documentos…</p>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 gap-6 md:grid-cols-[17rem_minmax(0,1fr)]">
          <div className="min-h-0 overflow-y-auto pr-1">
            <p className="px-2 pb-1 pt-0.5 text-[11px] font-bold uppercase tracking-wider text-ink-muted">
              Documentos
            </p>
            {tree.length === 0 ? (
              <div className="mt-2 rounded-xl border border-dashed border-line-strong/60 p-5 text-center">
                <p className="text-sm font-medium text-ink">Aún no hay notas</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                  Crea carpetas y notas enriquecidas, y vincúlalas a tus tareas.
                </p>
                <button
                  type="button"
                  onClick={() => handleCreate(null)}
                  className="mt-3 rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white hover:bg-ink/90"
                >
                  Crear primera nota
                </button>
              </div>
            ) : (
              <DocsTree
                nodes={tree}
                selectedDocId={selectedId}
                expandedIds={expandedIds}
                onToggleFolder={(id) =>
                  setExpandedIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })}
                onSelectDoc={handleSelectDoc}
                onCreateNote={(fid) => handleCreate(fid)}
                onCreateFolder={(pid) => handleCreateFolder(pid)}
                onRenameFolder={() => {}}
                onDeleteFolder={() => {}}
                onMoveDoc={() => {}}
                onMoveFolder={() => {}}
              />
            )}
          </div>

          <div className="flex min-h-0 flex-col">
            {selectedId ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex shrink-0 items-center gap-1.5 pb-2">
                  <button
                    type="button"
                    onClick={handleBackToTree}
                    aria-label="Volver al árbol"
                    className="-ml-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-muted hover:bg-surface-muted md:hidden"
                  >
                    <AppIcon glyph={CaretLeft} />
                  </button>
                  {folderPath(folders, selectedDoc?.parentFolderId ?? null).map((f, i) => (
                    <span key={f.id} className="flex min-w-0 items-center gap-1.5">
                      {i > 0 && <span className="text-ink-muted">/</span>}
                      <span className="max-w-[10rem] truncate text-xs font-medium text-ink-muted">{f.name}</span>
                    </span>
                  ))}
                  <div className="ml-auto flex shrink-0 items-center gap-1">
                    <span className="pr-1 text-[11px] font-medium text-ink-muted">
                      {saveState === "saving" ? "Guardando…" : saveState === "saved" ? "Guardado" : selectedDoc ? formatUpdated(selectedDoc.updatedAt) : ""}
                    </span>
                    <div className="relative shrink-0">
                      <button
                        ref={btnRef}
                        type="button"
                        onClick={() => {
                          setMenuOpen((o) => !o);
                          setExportOpen(false);
                        }}
                        aria-label="Opciones de la nota"
                        aria-expanded={menuOpen}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
                      >
                        {exporting ? (
                          <Spinner size="md" />
                        ) : (
                          <AppIcon glyph={DotsThreeVertical} weight="fill" />
                        )}
                      </button>
                      {menuOpen && menuPosition && createPortal(
                        <div className="pritio-menu-enter z-[100] w-56 max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-elevated"
                          style={{
                            position: "fixed",
                            top: menuPosition.top,
                            left: menuPosition.left,
                            width: menuPosition.width,
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setMenuOpen(false);
                              setShareOpen(true);
                            }}
                            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-ink transition-colors hover:bg-surface-muted"
                          >
                            <AppIcon glyph={ShareNetwork} className="text-ink-soft" />
                            Compartir
                          </button>
                          <button
                            type="button"
                            onClick={() => setExportOpen((o) => !o)}
                            aria-expanded={exportOpen}
                            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-ink transition-colors hover:bg-surface-muted"
                          >
                            <AppIcon glyph={DownloadSimple} className="text-ink-soft" />
                            Descargar
                          </button>
                          {exportOpen && (
                            <div className="border-t border-line py-1">
                              {(
                                [
                                  { fmt: "md" as const, label: "Markdown (.md)" },
                                  { fmt: "html" as const, label: "Página web (.html)" },
                                  { fmt: "docx" as const, label: "Word (.docx)" },
                                  { fmt: "pdf" as const, label: "Imprimir / PDF" },
                                ]
                              ).map((opt) => (
                                <button
                                  key={opt.fmt}
                                  type="button"
                                  onClick={() => void handleExport(opt.fmt)}
                                  className="flex w-full items-center gap-2.5 py-1.5 pl-11 pr-3.5 text-left text-sm text-ink-soft transition-colors hover:bg-surface-muted hover:text-ink"
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          )}
                          <div className="my-1 border-t border-line" />
                          <button
                            type="button"
                            onClick={() => {
                              setMenuOpen(false);
                              setConfirmDelete(true);
                            }}
                            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-red-500 transition-colors hover:bg-red-50"
                          >
                            <AppIcon glyph={Trash} />
                            Eliminar
                          </button>
                        </div>
                        , document.body)}
                    </div>
                  </div>
                </div>

                {selectedDoc ? (
                  <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-1 pb-6 md:px-4">
                    <input
                      key={`title-${selectedDoc.id}`}
                      type="text"
                      defaultValue={selectedDoc.title}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const v = e.target.value;
                        setDocs((prev) =>
                          prev.map((d) => (d.id === selectedDoc.id ? { ...d, title: v } : d)),
                        );
                        queueSave({ title: v });
                      }}
                      placeholder="Sin título"
                      aria-label="Título de la nota"
                      autoComplete="off"
                      spellCheck={false}
                      className="min-w-0 shrink-0 bg-transparent pb-1 text-3xl font-extrabold tracking-tight text-ink placeholder:text-line-strong focus:outline-none"
                    />

                    {/* Etiquetas: escribe # y separa con comas */}
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5 pb-3 pt-1.5">
                      {selectedDocTags.map((t) => (
                        <span
                          key={t.id}
                          className="inline-flex items-center gap-1 rounded-full py-0.5 pl-2 pr-1 text-[11px] font-semibold text-white"
                          style={{ backgroundColor: t.color }}
                        >
                          {t.name}
                          <button
                            type="button"
                            onClick={() => void removeTag(t.id)}
                            aria-label={`Quitar etiqueta ${t.name}`}
                            className="opacity-70 transition-opacity hover:opacity-100"
                          >
                            <AppIcon glyph={X} size="xs" />
                          </button>
                        </span>
                      ))}
                      <input
                        type="text"
                        value={tagInput}
                        onChange={(e) => handleTagInputChange(e.target.value)}
                        onKeyDown={handleTagKeyDown}
                        onBlur={() => {
                          const parts = tagInput.split(",").map((p) => p.trim()).filter(Boolean);
                          if (parts.length) {
                            setTagInput("");
                            void Promise.all(parts.map((p) => linkTagByName(p)));
                          }
                        }}
                        placeholder={selectedDocTags.length === 0 ? "# etiqueta, otra, …" : "+ etiqueta"}
                        aria-label="Agregar etiquetas"
                        autoComplete="off"
                        className="w-36 min-w-0 rounded-full border border-dashed border-line-strong/70 bg-transparent px-2.5 py-0.5 text-[11px] font-medium text-ink outline-none placeholder:text-ink-muted focus:border-pritio-blue/50"
                      />
                    </div>
                    <Suspense
                      fallback={
                        <div className="flex flex-1 items-center justify-center">
                          <p className="text-sm text-ink-muted">Cargando editor…</p>
                        </div>
                      }
                    >
                      <RichTextEditor
                        key={selectedDoc.id}
                        content={selectedDoc.content}
                        onChange={(html) => {
                          setDocs((prev) =>
                            prev.map((d) =>
                              d.id === selectedDoc.id ? { ...d, content: html } : d,
                            ),
                          );
                          queueSave({ content: html });
                        }}
                        placeholder="Empieza a escribir…"
                        unstyled
                        className="min-h-0 shrink-0"
                        contentClassName="min-h-[12rem] px-0 py-3"
                      />
                    </Suspense>
                  </div>
                ) : (
                  <div className="flex min-h-0 flex-1 items-center justify-center">
                    <p className="text-sm text-ink-muted">Cargando nota…</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 items-center justify-center">
                <p className="text-sm text-ink-muted">Selecciona una nota o crea una nueva</p>
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onConfirm={() => void handleDelete()}
        onClose={() => setConfirmDelete(false)}
        title="Eliminar nota"
        description="¿Eliminar esta nota? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        variant="danger"
      />

      {selectedDoc && (
        <ShareDialog
          open={shareOpen}
          docId={selectedDoc.id}
          docTitle={selectedDoc.title}
          visibility={selectedDoc.visibility}
          canManage={Boolean(profile && selectedDoc.createdBy === profile.id)}
          onVisibilityChange={(v) => {
            setDocs((prev) =>
              prev.map((d) => (d.id === selectedDoc!.id ? { ...d, visibility: v } : d)),
            );
            void updateDoc(selectedDoc!.id, { visibility: v }).catch(() => {
              toast.error("No se pudo cambiar el acceso del documento");
            });
          }}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  );
}