import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn, stripHtml } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import { useToast } from "@/components/Toast";
import {
  listDocs,
  createDoc,
  deleteDoc,
  updateDoc,
  linkDocToTask,
  unlinkDocFromTask,
  listTaskIdsForDoc,
  listFolders,
  createFolder,
  renameFolder,
  moveFolder as apiMoveFolder,
  deleteFolder as apiDeleteFolder,
  buildDocTree,
  listTags,
  createTag,
  listTagIdsForDoc,
  linkDocTag,
  unlinkDocTag,
  listAllTagLinks,
  listProjectIdsForDoc,
  linkDocToProject,
  unlinkDocFromProject,
  type Doc,
  type DocFolder,
  type DocTag,
} from "@/features/docs/api";
import { DocsTree } from "@/features/docs/DocsTree";
import { ShareDialog } from "@/features/docs/ShareDialog";
import { useDocPresence } from "@/features/docs/useDocPresence";
import { isOnline, loadSnapshot, queueOfflineOp, saveSnapshot } from "@/lib/offline";
import {
  buildStandaloneHtml,
  downloadFile,
  htmlToMarkdown,
  printStandaloneHtml,
  safeFileName,
} from "@/features/docs/exportUtils";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { listProjects } from "@/features/projects/api";
import type { Project } from "@/types";

/* El editor rico (Tiptap) se carga solo al abrir la vista de documentos. */
const RichTextEditor = lazy(() =>
  import("@/components/RichTextEditor").then((m) => ({ default: m.RichTextEditor })),
);

type ExportFormat = "md" | "html" | "docx" | "pdf";

const QUAD_DOT: Record<string, string> = {
  do: "#EF4444",
  plan: "#3B82F6",
  delegate: "#22C55E",
  later: "#8B5CF6",
};

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

/** Ruta de carpetas (raíz → padre) para el breadcrumb del documento. */
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

interface DocsViewProps {
  workspaceId: string;
}

export function DocsView({ workspaceId }: DocsViewProps) {
  const { profile, isAdmin } = useWorkspace();
  const { toast } = useToast();

  const [docs, setDocs] = useState<Doc[]>([]);
  const [folders, setFolders] = useState<DocFolder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const [linkedTaskIds, setLinkedTaskIds] = useState<string[]>([]);
  const [workspaceTasks, setWorkspaceTasks] = useState<
    { id: string; title: string; quadrant: string; completed: boolean }[]
  >([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<DocFolder | null>(null);
  const saveTimer = useRef<number | null>(null);
  const pendingRef = useRef<{ title?: string; content?: string | null }>({});
  const activeIdRef = useRef<string | null>(null);
  const docsRef = useRef<Doc[]>([]);
  useEffect(() => {
    docsRef.current = docs;
  }, [docs]);

  // Etiquetas y proyectos
  const [tags, setTags] = useState<DocTag[]>([]);
  const [tagLinks, setTagLinks] = useState<{ docId: string; tagId: string }[]>([]);
  const [docTagIds, setDocTagIds] = useState<string[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [docProjectIds, setDocProjectIds] = useState<string[]>([]);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const tagPickerRef = useRef<HTMLDivElement>(null);
  const projectPickerRef = useRef<HTMLDivElement>(null);

  // ─── Carga inicial ────────────────────────────────────────

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    setIsLoading(true);

    // Offline: servir snapshot inmediatamente.
    if (!isOnline()) {
      void loadSnapshot<{ docs: Doc[]; folders: DocFolder[] }>(`docs:${workspaceId}`).then((snap) => {
        if (cancelled) return;
        if (snap) {
          setDocs(snap.data.docs);
          setFolders(snap.data.folders);
          setSelectedId(null);
        }
        setIsLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }

    void Promise.all([
      listDocs(workspaceId),
      listFolders(workspaceId),
    ])
      .then(([rows, folderRows]) => {
        if (cancelled) return;
        setDocs(rows);
        setFolders(folderRows);
        setSelectedId(null);
        void saveSnapshot(`docs:${workspaceId}`, { docs: rows, folders: folderRows });
      })
      .catch(async () => {
        if (cancelled) return;
        const snap = await loadSnapshot<{ docs: Doc[]; folders: DocFolder[] }>(`docs:${workspaceId}`);
        if (snap) {
          setDocs(snap.data.docs);
          setFolders(snap.data.folders);
          setIsLoading(false);
          return;
        }
        toast.error("No se pudieron cargar los documentos");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    void supabase
      .from("tasks")
      .select("id, title, quadrant, completed")
      .eq("workspace_id", workspaceId)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setWorkspaceTasks(
          (data as { id: string; title: string; quadrant: string; completed: boolean }[]) ?? [],
        );
      });
    void listTags(workspaceId)
      .then((rows) => {
        if (!cancelled) setTags(rows);
      })
      .catch(() => {});
    void listAllTagLinks(workspaceId).then((rows) => {
      if (!cancelled) setTagLinks(rows);
    });
    void listProjects(workspaceId)
      .then((rows) => {
        if (!cancelled) setProjects(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [workspaceId, toast]);

  // ─── Autosave ─────────────────────────────────────────────

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
      // Sin conexión: encolar para sincronizar al reconectar.
      if (!isOnline()) {
        const doc = docsRef.current.find((d) => d.id === id);
        const workspaceIdSnap = doc?.workspaceId ?? workspaceId ?? "";
        void queueOfflineOp("doc_upsert", workspaceIdSnap, id, {
          workspace_id: workspaceIdSnap,
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.content !== undefined ? { content: patch.content } : {}),
        });
        setDocs((prev) =>
          prev.map((d) =>
            d.id === id ? { ...d, ...patch, updatedAt: new Date().toISOString() } : d,
          ),
        );
        setSaveState("saved");
        return;
      }
      toast.error("No se pudo guardar el documento");
    }
  }, [toast, workspaceId]);

  useEffect(
    () => () => {
      void flushSave();
    },
    [flushSave],
  );

  useEffect(() => {
    activeIdRef.current = selectedId;
    setLinkedTaskIds([]);
    setDocTagIds([]);
    setDocProjectIds([]);
    setTagPickerOpen(false);
    setProjectPickerOpen(false);
    if (!selectedId) return;
    let cancelled = false;
    void listTaskIdsForDoc(selectedId).then((ids) => {
      if (!cancelled) setLinkedTaskIds(ids);
    });
    void listTagIdsForDoc(selectedId).then((ids) => {
      if (!cancelled) setDocTagIds(ids);
    });
    void listProjectIdsForDoc(selectedId).then((ids) => {
      if (!cancelled) setDocProjectIds(ids);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

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

  // ─── Popover de vínculos con tareas ───────────────────────

  useEffect(() => {
    if (!pickerOpen) return;
    function handlePointerDown(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [pickerOpen]);

  // ─── Popovers de etiquetas y proyectos ────────────────────

  useEffect(() => {
    if (!tagPickerOpen) return;
    function handlePointerDown(e: MouseEvent) {
      if (tagPickerRef.current && !tagPickerRef.current.contains(e.target as Node)) setTagPickerOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [tagPickerOpen]);

  useEffect(() => {
    if (!projectPickerOpen) return;
    function handlePointerDown(e: MouseEvent) {
      if (projectPickerRef.current && !projectPickerRef.current.contains(e.target as Node))
        setProjectPickerOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [projectPickerOpen]);

  // ─── Acciones de documentos ───────────────────────────────

  const handleCreate = async (parentFolderId: string | null = null) => {
    if (!profile) return;
    try {
      await flushSave();
      const doc = await createDoc(workspaceId, profile.id, "", parentFolderId);
      setDocs((prev) => [doc, ...prev]);
      if (parentFolderId) {
        setExpandedIds((prev) => new Set(prev).add(parentFolderId));
      }
      setSelectedId(doc.id);
    } catch {
      toast.error("No se pudo crear el documento");
    }
  };

  const handleDelete = async () => {
    if (!selectedDoc) return;
    try {
      await deleteDoc(selectedDoc.id);
      setDocs((prev) => prev.filter((d) => d.id !== selectedDoc.id));
      setSelectedId(null);
      setConfirmDeleteDoc(false);
      toast.success("Documento eliminado");
    } catch {
      toast.error("No se pudo eliminar el documento");
    }
  };

  const toggleLink = async (taskId: string) => {
    if (!selectedDoc) return;
    const isLinked = linkedTaskIds.includes(taskId);
    setLinkedTaskIds((prev) =>
      isLinked ? prev.filter((id) => id !== taskId) : [...prev, taskId],
    );
    try {
      if (isLinked) await unlinkDocFromTask(selectedDoc.id, taskId);
      else await linkDocToTask(selectedDoc.id, taskId, selectedDoc.workspaceId);
    } catch {
      setLinkedTaskIds((prev) =>
        isLinked ? [...prev, taskId] : prev.filter((id) => id !== taskId),
      );
      toast.error("No se pudo actualizar el vínculo");
    }
  };

  // ─── Acciones de carpetas ─────────────────────────────────

  const handleCreateFolder = async (parentId: string | null = null) => {
    if (!profile) return;
    try {
      const folder = await createFolder(workspaceId, profile.id, "Carpeta sin título", parentId);
      setFolders((prev) => [...prev, folder]);
      if (parentId) setExpandedIds((prev) => new Set(prev).add(parentId));
    } catch {
      toast.error("No se pudo crear la carpeta");
    }
  };

  const handleRenameFolder = async (id: string, name: string) => {
    const prevFolders = folders;
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)));
    try {
      await renameFolder(id, name);
    } catch {
      setFolders(prevFolders);
      toast.error("No se pudo renombrar la carpeta");
    }
  };

  const handleMoveDoc = async (docId: string, targetFolderId: string | null) => {
    const before = docs.find((d) => d.id === docId);
    if (!before || before.parentFolderId === targetFolderId) return;
    setDocs((prev) =>
      prev.map((d) => (d.id === docId ? { ...d, parentFolderId: targetFolderId } : d)),
    );
    if (targetFolderId) setExpandedIds((prev) => new Set(prev).add(targetFolderId));
    try {
      await updateDoc(docId, { parentFolderId: targetFolderId });
    } catch {
      setDocs((prev) =>
        prev.map((d) => (d.id === docId ? { ...d, parentFolderId: before.parentFolderId } : d)),
      );
      toast.error("No se pudo mover el documento");
    }
  };

  const handleMoveFolder = async (folderId: string, targetFolderId: string | null) => {
    if (folderId === targetFolderId) return;
    // Evitar ciclos: no mover una carpeta dentro de sí misma o sus descendientes.
    const childrenOf = new Map<string | null, DocFolder[]>();
    for (const f of folders) {
      const list = childrenOf.get(f.parentId) ?? [];
      list.push(f);
      childrenOf.set(f.parentId, list);
    }
    const collectDesc = (id: string, acc: Set<string>) => {
      for (const c of childrenOf.get(id) ?? []) {
        acc.add(c.id);
        collectDesc(c.id, acc);
      }
    };
    if (targetFolderId) {
      const desc = new Set<string>();
      collectDesc(folderId, desc);
      if (desc.has(targetFolderId)) {
        toast.error("No puedes mover una carpeta dentro de sí misma");
        return;
      }
    }

    const before = folders.find((f) => f.id === folderId);
    if (!before || before.parentId === targetFolderId) return;
    setFolders((prev) =>
      prev.map((f) => (f.id === folderId ? { ...f, parentId: targetFolderId } : f)),
    );
    if (targetFolderId) setExpandedIds((prev) => new Set(prev).add(targetFolderId));
    try {
      await apiMoveFolder(folderId, targetFolderId);
    } catch {
      setFolders((prev) =>
        prev.map((f) => (f.id === folderId ? { ...f, parentId: before.parentId } : f)),
      );
      toast.error("No se pudo mover la carpeta");
    }
  };

  const handleDeleteFolder = async () => {
    if (!folderToDelete) return;
    const doomed = folderToDelete;
    setFolderToDelete(null);
    try {
      await apiDeleteFolder(doomed.id);
      setFolders((prev) => prev.filter((f) => f.id !== doomed.id && f.parentId !== doomed.id));
      setDocs((prev) =>
        prev.map((d) => (d.parentFolderId === doomed.id ? { ...d, parentFolderId: null } : d)),
      );
      toast.success(`Carpeta "${doomed.name}" eliminada. Sus notas pasaron a la raíz.`);
    } catch {
      toast.error("No se pudo eliminar la carpeta");
    }
  };

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ─── Etiquetas y proyectos del documento ──────────────────

  const toggleDocTag = async (tagId: string) => {
    if (!selectedDoc) return;
    const isLinked = docTagIds.includes(tagId);
    setDocTagIds((prev) => (isLinked ? prev.filter((id) => id !== tagId) : [...prev, tagId]));
    setTagLinks((prev) =>
      isLinked
        ? prev.filter((l) => !(l.docId === selectedDoc.id && l.tagId === tagId))
        : [...prev, { docId: selectedDoc.id, tagId }],
    );
    try {
      if (isLinked) await unlinkDocTag(selectedDoc.id, tagId);
      else await linkDocTag(selectedDoc.id, tagId, selectedDoc.workspaceId);
    } catch {
      setDocTagIds((prev) => (isLinked ? [...prev, tagId] : prev.filter((id) => id !== tagId)));
      toast.error("No se pudo actualizar la etiqueta");
    }
  };

  const handleCreateTag = async () => {
    if (!selectedDoc || !profile) return;
    const name = newTagName.trim();
    if (!name) return;
    const existing = tags.find((t) => t.name.toLowerCase() === name.toLowerCase());
    setNewTagName("");
    if (existing) {
      if (!docTagIds.includes(existing.id)) void toggleDocTag(existing.id);
      return;
    }
    const color = TAG_PALETTE[tags.length % TAG_PALETTE.length];
    try {
      const tag = await createTag(selectedDoc.workspaceId, profile.id, name, color);
      setTags((prev) => [...prev, tag].sort((a, b) => a.name.localeCompare(b.name)));
      await linkDocTag(selectedDoc.id, tag.id, selectedDoc.workspaceId);
      setDocTagIds((prev) => [...prev, tag.id]);
      setTagLinks((prev) => [...prev, { docId: selectedDoc.id, tagId: tag.id }]);
    } catch {
      toast.error("No se pudo crear la etiqueta");
    }
  };

  const toggleDocProject = async (projectId: string) => {
    if (!selectedDoc) return;
    const isLinked = docProjectIds.includes(projectId);
    setDocProjectIds((prev) =>
      isLinked ? prev.filter((id) => id !== projectId) : [...prev, projectId],
    );
    try {
      if (isLinked) await unlinkDocFromProject(selectedDoc.id, projectId);
      else await linkDocToProject(selectedDoc.id, projectId, selectedDoc.workspaceId);
    } catch {
      setDocProjectIds((prev) =>
        isLinked ? [...prev, projectId] : prev.filter((id) => id !== projectId),
      );
      toast.error("No se pudo actualizar el proyecto");
    }
  };

  const selectedDoc = useMemo(() => docs.find((d) => d.id === selectedId) ?? null, [docs, selectedId]);

  // Expandir la ruta de la nota seleccionada.
  useEffect(() => {
    if (!selectedDoc) return;
    const path = folderPath(folders, selectedDoc.parentFolderId);
    if (path.length === 0) return;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const f of path) {
        if (!next.has(f.id)) {
          next.add(f.id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [selectedDoc?.id, folders]); // eslint-disable-line react-hooks/exhaustive-deps -- solo reaccionar a cambios de doc/carpeta

  // ─── Derivados ────────────────────────────────────────────

  const filteredDocs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q && !activeTagFilter) return docs;
    return docs.filter((d) => {
      if (activeTagFilter && !tagLinks.some((l) => l.docId === d.id && l.tagId === activeTagFilter)) {
        return false;
      }
      if (!q) return true;
      const inTitle = d.title.toLowerCase().includes(q);
      const inContent = stripHtml(d.content).toLowerCase().includes(q);
      const inTags = tagLinks.some(
        (l) =>
          l.docId === d.id &&
          (tags.find((t) => t.id === l.tagId)?.name ?? "").toLowerCase().includes(q),
      );
      return inTitle || inContent || inTags;
    });
  }, [docs, search, activeTagFilter, tagLinks, tags]);

  const tree = useMemo(() => buildDocTree(folders, filteredDocs), [folders, filteredDocs]);

  const breadcrumb = useMemo(
    () => (selectedDoc ? folderPath(folders, selectedDoc.parentFolderId) : []),
    [folders, selectedDoc],
  );

  const pickerTasks = useMemo(
    () => workspaceTasks.filter((t) => !t.completed).slice(0, 60),
    [workspaceTasks],
  );

  const linkedTasks = useMemo(
    () =>
      linkedTaskIds
        .map((id) => workspaceTasks.find((t) => t.id === id))
        .filter((t): t is NonNullable<typeof t> => Boolean(t)),
    [linkedTaskIds, workspaceTasks],
  );

  const searchActive = search.trim().length > 0 || activeTagFilter !== null;

  const selectedDocTags = useMemo(
    () => docTagIds.map((id) => tags.find((t) => t.id === id)).filter((t): t is DocTag => Boolean(t)),
    [docTagIds, tags],
  );

  const selectedDocProjects = useMemo(
    () =>
      docProjectIds
        .map((id) => projects.find((p) => p.id === id))
        .filter((p): p is Project => Boolean(p)),
    [docProjectIds, projects],
  );

  // ─── Compartir / exportar / presencia ────────────────────

  const [shareOpen, setShareOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const exportRef = useRef<HTMLDivElement | null>(null);
  const presencePeers = useDocPresence(selectedDoc?.id ?? null);

  useEffect(() => {
    if (!exportOpen) return;
    const onDown = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [exportOpen]);

  const canManageDoc =
    Boolean(selectedDoc && profile && selectedDoc.createdBy === profile.id) || isAdmin;

  const handleVisibilityChange = useCallback(
    (v: "workspace" | "restricted") => {
      if (!selectedDoc || !canManageDoc) return;
      const before = selectedDoc.visibility;
      setDocs((prev) => prev.map((d) => (d.id === selectedDoc.id ? { ...d, visibility: v } : d)));
      void updateDoc(selectedDoc.id, { visibility: v }).catch(() => {
        setDocs((prev) =>
          prev.map((d) => (d.id === selectedDoc.id ? { ...d, visibility: before } : d)),
        );
        toast.error("No se pudo cambiar el acceso del documento");
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast estable
    [selectedDoc?.id, selectedDoc?.visibility, canManageDoc],
  );

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      if (!selectedDoc) return;
      setExportOpen(false);
      try {
        if (format !== "docx") await flushSave();
        const name = safeFileName(selectedDoc.title, format === "md" ? "md" : format);
        if (format === "md") {
          downloadFile(name, "text/markdown", htmlToMarkdown(selectedDoc.content));
        } else if (format === "html") {
          const html = buildStandaloneHtml(selectedDoc.title, selectedDoc.content);
          downloadFile(name, "text/html", html);
        } else if (format === "pdf") {
          const html = buildStandaloneHtml(selectedDoc.title, selectedDoc.content);
          printStandaloneHtml(html);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- helpers estables
    [selectedDoc?.id, selectedDoc?.title, selectedDoc?.content],
  );


  // ─── Render ───────────────────────────────────────────────

  return (
    <div className="flex flex-1 flex-col overflow-hidden p-4 lg:p-8">
      {/* Barra superior */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative min-w-0 max-w-xs flex-1">
          <svg
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
            viewBox="0 0 16 16"
            fill="none"
          >
            <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
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
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
            <path
              d="M2 5a1.5 1.5 0 011.5-1.5h2.6c.35 0 .68.15.91.41l.62.71c.23.26.56.41.9.41h3.47A1.5 1.5 0 0113.5 6.5v4A1.5 1.5 0 0112 12H3.5A1.5 1.5 0 012 10.5V5z"
              fill="currentColor"
              opacity="0.55"
            />
            <path d="M8 6v4M6 8h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          Carpeta
        </button>
        <button
          type="button"
          onClick={() => void handleCreate(null)}
          disabled={isLoading}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-ink px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-ink/90 disabled:opacity-50"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
            <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          Nueva nota
        </button>
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-ink-muted">Cargando documentos…</p>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 gap-6 md:grid-cols-[17rem_minmax(0,1fr)]">
          {/* Árbol / lista */}
          <div
            className={cn(
              "min-h-0 overflow-y-auto pr-1",
              selectedId ? "hidden md:block" : "block",
            )}
          >
            {!searchActive ? (
              <>
                <p className="px-2 pb-1 pt-0.5 text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                  Documentos
                </p>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 px-1 pb-2">
                    {tags.map((t) => {
                      const active = activeTagFilter === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setActiveTagFilter(active ? null : t.id)}
                          aria-pressed={active}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
                            active
                              ? "border-transparent text-white"
                              : "border-line bg-surface text-ink-soft hover:border-line-strong",
                          )}
                          style={active ? { backgroundColor: t.color } : undefined}
                        >
                          {!active && (
                            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: t.color }} />
                          )}
                          {t.name}
                        </button>
                      );
                    })}
                  </div>
                )}
                {tree.length === 0 ? (
                  <div className="mt-2 rounded-xl border border-dashed border-line-strong/60 p-5 text-center">
                    <p className="text-sm font-medium text-ink">Aún no hay notas</p>
                    <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                      Crea carpetas y notas enriquecidas, y vincúlalas a tus tareas.
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleCreate(null)}
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
                    onToggleFolder={toggleExpanded}
                    onSelectDoc={(id) => void flushSave().then(() => setSelectedId(id))}
                    onCreateNote={(fid) => void handleCreate(fid)}
                    onCreateFolder={(pid) => void handleCreateFolder(pid)}
                    onRenameFolder={(id, name) => void handleRenameFolder(id, name)}
                    onDeleteFolder={(id) =>
                      setFolderToDelete(folders.find((f) => f.id === id) ?? null)
                    }
                    onMoveDoc={(docId, fid) => void handleMoveDoc(docId, fid)}
                    onMoveFolder={(folderId, targetId) => void handleMoveFolder(folderId, targetId)}
                  />
                )}
              </>
            ) : (
              <>
                <p className="px-2 pb-1 pt-0.5 text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                  Resultados ({filteredDocs.length})
                </p>
                {filteredDocs.length === 0 ? (
                  <div className="mt-2 rounded-xl border border-dashed border-line-strong/60 p-5 text-center">
                    <p className="text-sm font-medium text-ink">Sin resultados</p>
                    <p className="mt-1 text-xs text-ink-muted">Prueba con otro término.</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {filteredDocs.map((doc) => (
                      <button
                        key={doc.id}
                        type="button"
                        onClick={() => void flushSave().then(() => setSelectedId(doc.id))}
                        className={cn(
                          "flex w-full flex-col gap-0.5 rounded-xl border px-3 py-2.5 text-left transition-all",
                          doc.id === selectedId
                            ? "border-pritio-blue bg-pritio-blue/5"
                            : "border-line bg-surface hover:border-line-strong hover:bg-surface-subtle",
                        )}
                      >
                        <span className="truncate text-sm font-semibold text-ink">
                          {doc.title || "Sin título"}
                        </span>
                        <span className="text-[11px] text-ink-muted">
                          {formatUpdated(doc.updatedAt)}
                          {doc.parentFolderId && folders.some((f) => f.id === doc.parentFolderId)
                            ? ` · ${folderPath(folders, doc.parentFolderId)
                                .map((f) => f.name)
                                .join(" / ")}`
                            : ""}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Editor a área completa (estilo Notion) */}
          <div className={cn("flex min-h-0 flex-col", selectedId ? "flex" : "hidden md:flex")}>
            {selectedDoc ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-1 pb-6 md:px-6">
                {/* Breadcrumb */}
                <div className="flex shrink-0 items-center gap-1.5 pb-2">
                  <button
                    type="button"
                    onClick={() => void flushSave().then(() => setSelectedId(null))}
                    className="-ml-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-muted hover:bg-surface-muted md:hidden"
                    aria-label="Volver al árbol"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                      <path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  {breadcrumb.map((f, i) => (
                    <span key={f.id} className="flex min-w-0 items-center gap-1.5">
                      {i > 0 && <span className="text-ink-muted">/</span>}
                      <span className="max-w-[10rem] truncate text-xs font-medium text-ink-muted">{f.name}</span>
                    </span>
                  ))}
                  {breadcrumb.length > 0 && <span className="text-ink-muted">/</span>}
                  <div className="ml-auto flex shrink-0 items-center gap-1 pl-2">
                    {/* Presencia: quiénes tienen el doc abierto */}
                    {presencePeers.length > 0 && (
                      <div className="mr-1 hidden items-center md:flex" aria-label={`${presencePeers.length} persona(s) viendo`}>
                        {presencePeers.slice(0, 4).map((p, i) => (
                          <span
                            key={p.key}
                            title={p.name}
                            className="grid h-6 w-6 place-items-center rounded-full border-2 border-surface text-[9px] font-bold text-white"
                            style={{ backgroundColor: p.color, marginLeft: i > 0 ? "-7px" : 0, zIndex: i }}
                          >
                            {p.name
                              .split(" ")
                              .slice(0, 2)
                              .map((w) => w[0])
                              .join("")
                              .toUpperCase()}
                          </span>
                        ))}
                        {presencePeers.length > 4 && (
                          <span
                            className="grid h-6 w-6 place-items-center rounded-full border-2 border-surface bg-surface-muted text-[9px] font-bold text-ink-soft"
                            style={{ marginLeft: "-7px", zIndex: 4 }}
                          >
                            +{presencePeers.length - 4}
                          </span>
                        )}
                      </div>
                    )}
                    <span className="pr-1 text-[11px] font-medium text-ink-muted">
                      {saveState === "saving" ? "Guardando…" : saveState === "saved" ? "Guardado" : formatUpdated(selectedDoc.updatedAt)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShareOpen(true)}
                      aria-label="Compartir documento"
                      title="Compartir"
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                        <circle cx="11.5" cy="3.5" r="1.75" stroke="currentColor" strokeWidth="1.4" />
                        <circle cx="4" cy="8" r="1.75" stroke="currentColor" strokeWidth="1.4" />
                        <circle cx="11.5" cy="12.5" r="1.75" stroke="currentColor" strokeWidth="1.4" />
                        <path d="M5.6 7.2l4.3-2.5M5.6 8.8l4.3 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                      </svg>
                    </button>
                    <div className="relative shrink-0" ref={exportRef}>
                      <button
                        type="button"
                        onClick={() => setExportOpen((o) => !o)}
                        aria-label="Exportar documento"
                        aria-expanded={exportOpen}
                        title="Exportar"
                        disabled={Boolean(exporting)}
                        className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink disabled:opacity-50"
                      >
                        {exporting === "docx" ? (
                          <svg className="h-4 w-4 animate-spin" viewBox="0 0 16 16" fill="none">
                            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.6" opacity=".25" />
                            <path d="M14 8a6 6 0 00-6-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                          </svg>
                        ) : (
                          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                            <path d="M8 2.5v7m0 0L5.5 7M8 9.5L10.5 7M3 10.5v1.25A1.25 1.25 0 004.25 13h7.5a1.25 1.25 0 001.25-1.25V10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </button>
                      {exportOpen && (
                        <div className="pritio-menu-enter absolute right-0 top-full z-30 mt-1.5 w-52 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-elevated">
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
                              className="flex w-full items-center px-3.5 py-2 text-left text-sm text-ink transition-colors hover:bg-surface-muted"
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteDoc(true)}
                      aria-label="Eliminar documento"
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                        <path d="M2.5 4.5h11M6.5 2.5v-.75a.75.75 0 01.75-.75h1.5a.75.75 0 01.75.75v.75m3 2l-.6 8.4a1.5 1.5 0 01-1.5 1.35H5.85a1.5 1.5 0 01-1.5-1.35l-.6-8.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Título grande inline */}
                <input
                  key={`title-${selectedDoc.id}`}
                  type="text"
                  defaultValue={selectedDoc.title}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDocs((prev) =>
                      prev.map((d) => (d.id === selectedDoc.id ? { ...d, title: v } : d)),
                    );
                    queueSave({ title: v });
                  }}
                  placeholder="Sin título"
                  aria-label="Título del documento"
                  className="min-w-0 shrink-0 bg-transparent pb-1 text-3xl font-extrabold tracking-tight text-ink placeholder:text-line-strong focus:outline-none"
                />

                {/* Etiquetas y proyectos */}
                <div className="flex shrink-0 flex-wrap items-center gap-1.5 pb-3 pt-1">
                  {selectedDocTags.map((t) => (
                    <span
                      key={t.id}
                      className="inline-flex items-center gap-1 rounded-full py-0.5 pl-2 pr-1 text-[11px] font-semibold text-white"
                      style={{ backgroundColor: t.color }}
                    >
                      {t.name}
                      <button
                        type="button"
                        onClick={() => void toggleDocTag(t.id)}
                        aria-label={`Quitar etiqueta ${t.name}`}
                        className="opacity-70 transition-opacity hover:opacity-100"
                      >
                        <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                          <path d="M3 3l6 6M9 3L3 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                        </svg>
                      </button>
                    </span>
                  ))}
                  <div className="relative" ref={tagPickerRef}>
                    <button
                      type="button"
                      onClick={() => setTagPickerOpen((v) => !v)}
                      aria-expanded={tagPickerOpen}
                      className="rounded-full border border-dashed border-line-strong/70 px-2 py-0.5 text-[11px] font-medium text-ink-soft transition-colors hover:border-pritio-blue/50 hover:text-pritio-blue"
                    >
                      + Etiqueta
                    </button>
                    {tagPickerOpen && (
                      <div className="pritio-menu-enter absolute left-0 top-full z-30 mt-1.5 w-[15rem] rounded-xl border border-line bg-surface p-2 shadow-elevated">
                        <input
                          type="text"
                          value={newTagName}
                          onChange={(e) => setNewTagName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void handleCreateTag();
                            }
                          }}
                          placeholder="Nueva etiqueta… (Enter)"
                          aria-label="Nueva etiqueta"
                          className="mb-1.5 w-full rounded-lg border border-line bg-surface-subtle px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-muted focus:border-pritio-blue focus:outline-none"
                        />
                        {tags.length === 0 ? (
                          <p className="px-2 py-2 text-center text-xs text-ink-muted">
                            Escribe arriba para crear la primera etiqueta.
                          </p>
                        ) : (
                          <div className="max-h-[12rem] overflow-y-auto">
                            {tags.map((t) => {
                              const linked = docTagIds.includes(t.id);
                              return (
                                <button
                                  key={t.id}
                                  type="button"
                                  onClick={() => void toggleDocTag(t.id)}
                                  className={cn(
                                    "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-muted",
                                    linked && "bg-pritio-blue/5",
                                  )}
                                >
                                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
                                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{t.name}</span>
                                  {linked && (
                                    <svg className="h-3.5 w-3.5 shrink-0 text-pritio-blue" viewBox="0 0 16 16" fill="none">
                                      <path d="M3.5 8.5l3 3 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {selectedDocProjects.map((p) => (
                    <span
                      key={p.id}
                      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-surface-subtle py-0.5 pl-2 pr-1 text-[11px] font-medium text-ink"
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                      <span className="max-w-[9rem] truncate">{p.name}</span>
                      <button
                        type="button"
                        onClick={() => void toggleDocProject(p.id)}
                        aria-label={`Quitar proyecto ${p.name}`}
                        className="text-ink-muted transition-colors hover:text-pritio-coral"
                      >
                        <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                          <path d="M3 3l6 6M9 3L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </button>
                    </span>
                  ))}
                  <div className="relative" ref={projectPickerRef}>
                    <button
                      type="button"
                      onClick={() => setProjectPickerOpen((v) => !v)}
                      aria-expanded={projectPickerOpen}
                      className="rounded-full border border-dashed border-line-strong/70 px-2 py-0.5 text-[11px] font-medium text-ink-soft transition-colors hover:border-pritio-purple/50 hover:text-pritio-purple"
                    >
                      + Proyecto
                    </button>
                    {projectPickerOpen && (
                      <div className="pritio-menu-enter absolute left-0 top-full z-30 mt-1.5 max-h-[14rem] w-[15rem] overflow-y-auto rounded-xl border border-line bg-surface p-2 shadow-elevated">
                        {projects.length === 0 ? (
                          <p className="px-2 py-2 text-center text-xs text-ink-muted">
                            No hay proyectos en este workspace.
                          </p>
                        ) : (
                          projects.map((p) => {
                            const linked = docProjectIds.includes(p.id);
                            return (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => void toggleDocProject(p.id)}
                                className={cn(
                                  "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-muted",
                                  linked && "bg-pritio-purple/5",
                                )}
                              >
                                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                                <span className="min-w-0 flex-1 truncate text-sm text-ink">{p.name}</span>
                                {linked && (
                                  <svg className="h-3.5 w-3.5 shrink-0 text-pritio-purple" viewBox="0 0 16 16" fill="none">
                                    <path d="M3.5 8.5l3 3 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                )}
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Contenido */}
                <Suspense
                  fallback={
                    <div className="mt-4 min-h-[14rem] flex-1 animate-pulse rounded-xl bg-surface-subtle" />
                  }
                >
                  <RichTextEditor
                    key={selectedDoc.id}
                    content={selectedDoc.content}
                    onChange={(html) => queueSave({ content: html })}
                    placeholder="Empieza a escribir…"
                    unstyled
                    className="min-h-0 shrink-0"
                    contentClassName="min-h-[12rem] px-0 py-3"
                  />
                </Suspense>

                {/* Tareas vinculadas */}
                <div className="mt-6 shrink-0 border-t border-line/60 pt-3">
                  <div className="relative" ref={pickerRef}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="mr-1 text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                        Tareas vinculadas
                      </span>
                      {linkedTasks.map((t) => (
                        <span
                          key={t.id}
                          className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-surface py-1 pl-2 pr-1.5 text-xs font-medium text-ink"
                        >
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: QUAD_DOT[t.quadrant] ?? "#6B7280" }}
                          />
                          <span className="max-w-[10rem] truncate">{t.title}</span>
                          <button
                            type="button"
                            onClick={() => void toggleLink(t.id)}
                            aria-label={`Desvincular tarea: ${t.title}`}
                            className="text-ink-muted transition-colors hover:text-pritio-coral"
                          >
                            <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                              <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                          </button>
                        </span>
                      ))}
                      <button
                        type="button"
                        onClick={() => setPickerOpen((v) => !v)}
                        aria-expanded={pickerOpen}
                        className="rounded-full border border-dashed border-line-strong/70 px-2.5 py-1 text-xs font-medium text-ink-soft transition-colors hover:border-pritio-blue/50 hover:text-pritio-blue"
                      >
                        + Vincular tarea
                      </button>
                    </div>

                    {pickerOpen && (
                      <div className="pritio-menu-enter absolute bottom-full left-0 z-30 mb-2 max-h-[16rem] w-[19rem] overflow-y-auto rounded-xl border border-line bg-surface p-2 shadow-elevated">
                        {pickerTasks.length === 0 ? (
                          <p className="px-2 py-3 text-center text-xs text-ink-muted">
                            No hay tareas activas para vincular.
                          </p>
                        ) : (
                          pickerTasks.map((t) => {
                            const linked = linkedTaskIds.includes(t.id);
                            return (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => void toggleLink(t.id)}
                                className={cn(
                                  "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-muted",
                                  linked && "bg-pritio-blue/5",
                                )}
                              >
                                <span
                                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                                  style={{ backgroundColor: QUAD_DOT[t.quadrant] ?? "#6B7280" }}
                                />
                                <span className="min-w-0 flex-1 truncate text-sm text-ink">{t.title}</span>
                                {linked && (
                                  <svg className="h-3.5 w-3.5 shrink-0 text-pritio-blue" viewBox="0 0 16 16" fill="none">
                                    <path d="M3.5 8.5l3 3 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                )}
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-line-strong/50">
                <p className="max-w-[18rem] text-center text-sm leading-relaxed text-ink-muted">
                  Selecciona una nota del árbol o crea una nueva para empezar a escribir.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDeleteDoc}
        onClose={() => setConfirmDeleteDoc(false)}
        onConfirm={() => void handleDelete()}
        title="Eliminar documento"
        description={`Se eliminará "${selectedDoc?.title || "Sin título"}" y sus vínculos con tareas. Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        variant="danger"
      />

      <ConfirmDialog
        open={Boolean(folderToDelete)}
        onClose={() => setFolderToDelete(null)}
        onConfirm={() => void handleDeleteFolder()}
        title="Eliminar carpeta"
        description={`Se eliminará la carpeta "${folderToDelete?.name ?? ""}" y sus subcarpetas. Las notas que contenga pasarán a la raíz.`}
        confirmLabel="Eliminar"
        variant="danger"
      />

      {selectedDoc && (
        <ShareDialog
          open={shareOpen}
          docId={selectedDoc.id}
          docTitle={selectedDoc.title}
          visibility={selectedDoc.visibility}
          canManage={canManageDoc}
          onVisibilityChange={handleVisibilityChange}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  );
}
