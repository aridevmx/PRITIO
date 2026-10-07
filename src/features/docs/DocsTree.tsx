import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { AppIcon } from "@/components/AppIcon";
import { CaretRight, DotsThree, File, FolderSimple, Plus } from "@phosphor-icons/react";
import type { TreeNode } from "@/features/docs/api";

interface DocsTreeProps {
  nodes: TreeNode[];
  selectedDocId: string | null;
  expandedIds: Set<string>;
  onToggleFolder: (id: string) => void;
  onSelectDoc: (id: string) => void;
  onCreateNote: (folderId: string | null) => void;
  onCreateFolder: (parentId: string | null) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onMoveDoc: (docId: string, folderId: string | null) => void;
  onMoveFolder: (folderId: string, targetFolderId: string | null) => void;
}

const ROOT_DROP_ID = "docs-tree-root";
const FOLDER_DROP_PREFIX = "docs-folder:";
const DOC_PREFIX = "docs-doc:";
const FOLDER_PREFIX = "docs-folder-item:";

type TreeCallbacks = Omit<DocsTreeProps, "nodes">;

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <AppIcon
      glyph={CaretRight}
      size="xs"
      className={cn("shrink-0 text-ink-muted transition-transform duration-150", open && "rotate-90")}
    />
  );
}

const FolderGlyph = <AppIcon glyph={FolderSimple} size="sm" className="shrink-0" />;
const DocGlyph = <AppIcon glyph={File} size="sm" className="shrink-0" />;

function useOutsideClose(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, onClose]);
  return ref;
}

function FolderMenu({
  onCreateNote,
  onCreateSubfolder,
  onRename,
  onDelete,
}: {
  onCreateNote: () => void;
  onCreateSubfolder: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open || !btnRef.current) return;

    const updatePosition = () => {
      const rect = btnRef.current!.getBoundingClientRect();
      const menuWidth = 160; // min-w-[10rem] = 160px
      const viewportWidth = window.innerWidth;
      const left = Math.min(rect.right - menuWidth, viewportWidth - menuWidth - 16);
      setMenuPosition({
        top: rect.bottom + 4, // mt-1 = 4px
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
  }, [open]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        btnRef.current &&
        !btnRef.current.contains(e.target as Node) &&
        (e.target as HTMLElement).closest("[data-folder-menu]") === null
      ) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const menuContent = (
    <div
      data-folder-menu
      className="pritio-menu-enter z-[100] min-w-[10rem] max-w-[calc(100vw-1rem)] overflow-hidden rounded-lg border border-line bg-white py-1 shadow-elevated"
      style={{
        position: "fixed",
        top: menuPosition?.top ?? 0,
        left: menuPosition?.left ?? 0,
        width: menuPosition?.width ?? 160,
      }}
    >
      {[
        { label: "Nueva nota aquí", action: onCreateNote },
        { label: "Nueva subcarpeta", action: onCreateSubfolder },
        { label: "Renombrar", action: onRename },
      ].map((item) => (
        <button
          key={item.label}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(false);
            item.action();
          }}
          className="block w-full px-3 py-1.5 text-left text-xs font-medium text-ink transition-colors hover:bg-surface-muted"
        >
          {item.label}
        </button>
      ))}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(false);
          onDelete();
        }}
        className="block w-full px-3 py-1.5 text-left text-xs font-medium text-pritio-coral transition-colors hover:bg-pritio-coral/10"
      >
        Eliminar carpeta
      </button>
    </div>
  );

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        aria-label="Opciones de carpeta"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="grid h-5 w-5 place-items-center rounded text-ink-muted opacity-0 transition-opacity hover:bg-surface-muted group-hover/folder:opacity-100"
      >
        <AppIcon glyph={DotsThree} weight="fill" />
      </button>
      {open && menuPosition && createPortal(menuContent, document.body)}
    </div>
  );
}

function DraggableRow({
  dragId,
  children,
}: {
  dragId: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: dragId });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(isDragging && "opacity-40")}
    >
      {children}
    </div>
  );
}

function FolderDropZone({
  folderId,
  children,
}: {
  folderId: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${FOLDER_DROP_PREFIX}${folderId}` });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-lg transition-colors",
        isOver && "bg-pritio-blue/10 ring-1 ring-inset ring-pritio-blue/40",
      )}
    >
      {children}
    </div>
  );
}

interface RowProps extends TreeCallbacks {
  node: TreeNode;
  depth: number;
}

function TreeRow({ node, depth, ...props }: RowProps) {
  if (node.kind === "doc") {
    return <DocRow node={node} depth={depth} {...props} />;
  }

  const open = props.expandedIds.has(node.id);

  return (
    <>
      <FolderDropZone folderId={node.id}>
        <DraggableRow dragId={`${FOLDER_PREFIX}${node.id}`}>
          <div
            role="treeitem"
            aria-expanded={open}
            style={{ paddingLeft: depth * 14 + 4 }}
            className="group/folder flex cursor-pointer items-center gap-1 rounded-lg py-1 pr-1 transition-colors hover:bg-surface-muted"
            onClick={() => props.onToggleFolder(node.id)}
          >
            <ChevronIcon open={open} />
            <span className="text-pritio-purple">{FolderGlyph}</span>
            <FolderNameOrInput node={node} {...props} />
          </div>
        </DraggableRow>
      </FolderDropZone>
      {open &&
        node.children.map((child) => (
          <TreeRow
            key={child.kind + child.id}
            node={child}
            depth={depth + 1}
            selectedDocId={props.selectedDocId}
            expandedIds={props.expandedIds}
            onToggleFolder={props.onToggleFolder}
            onSelectDoc={props.onSelectDoc}
            onCreateNote={props.onCreateNote}
            onCreateFolder={props.onCreateFolder}
            onRenameFolder={props.onRenameFolder}
            onDeleteFolder={props.onDeleteFolder}
            onMoveDoc={props.onMoveDoc}
            onMoveFolder={props.onMoveFolder}
          />
        ))}
    </>
  );
}

function FolderNameOrInput(props: Omit<RowProps, "depth">) {
  const folder = props.node as Extract<TreeNode, { kind: "folder" }>;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(folder.name);

  if (!editing) {
    return (
      <>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{folder.name}</span>
        <FolderMenu
          onCreateNote={() => props.onCreateNote(folder.id)}
          onCreateSubfolder={() => props.onCreateFolder(folder.id)}
          onRename={() => {
            setDraft(folder.name);
            setEditing(true);
          }}
          onDelete={() => props.onDeleteFolder(folder.id)}
        />
        <button
          type="button"
          aria-label={`Nueva nota en ${folder.name}`}
          onClick={(e) => {
            e.stopPropagation();
            props.onCreateNote(folder.id);
          }}
          className="grid h-5 w-5 place-items-center rounded text-ink-muted opacity-0 transition-opacity hover:bg-surface-muted hover:text-pritio-blue group-hover/folder:opacity-100"
        >
          <AppIcon glyph={Plus} size="sm" />
        </button>
      </>
    );
  }

  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={() => {
        const name = draft.trim();
        if (name && name !== folder.name) props.onRenameFolder(folder.id, name);
        setEditing(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(folder.name);
          setEditing(false);
        }
      }}
      className="min-w-0 flex-1 rounded border border-pritio-blue bg-surface px-1 py-0.5 text-sm text-ink outline-none"
      aria-label="Nombre de la carpeta"
    />
  );
}

function DocRow({ node, depth, selectedDocId, onSelectDoc }: RowProps) {
  if (node.kind !== "doc") return null;
  return (
    <DraggableRow dragId={`${DOC_PREFIX}${node.id}`}>
      <button
        type="button"
        role="treeitem"
        aria-selected={selectedDocId === node.id}
        style={{ paddingLeft: depth * 14 + 20 }}
        onClick={() => onSelectDoc(node.id)}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-lg py-1 pr-2 text-left transition-colors",
          selectedDocId === node.id
            ? "bg-pritio-blue/10 text-ink"
            : "text-ink-soft hover:bg-surface-muted hover:text-ink",
        )}
      >
        <span className={selectedDocId === node.id ? "text-pritio-blue" : "text-ink-muted"}>{DocGlyph}</span>
        <span className="min-w-0 flex-1 truncate text-sm">{node.title || "Sin título"}</span>
      </button>
    </DraggableRow>
  );
}

export function DocsTree(props: DocsTreeProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    let targetFolderId: string | null;
    if (overId === ROOT_DROP_ID) targetFolderId = null;
    else if (overId.startsWith(FOLDER_DROP_PREFIX)) targetFolderId = overId.slice(FOLDER_DROP_PREFIX.length);
    else return;

    if (activeId.startsWith(FOLDER_PREFIX) && targetFolderId === activeId.slice(FOLDER_PREFIX.length)) {
      return;
    }

    if (activeId.startsWith(DOC_PREFIX)) {
      const docId = activeId.slice(DOC_PREFIX.length);
      props.onMoveDoc(docId, targetFolderId);
    } else if (activeId.startsWith(FOLDER_PREFIX)) {
      const folderId = activeId.slice(FOLDER_PREFIX.length);
      props.onMoveFolder(folderId, targetFolderId);
    }
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <RootDropZone>
        <div role="tree" aria-label="Documentos" className="space-y-px">
          {props.nodes.map((n) => (
            <TreeRow key={n.kind + n.id} node={n} depth={0} {...props} />
          ))}
        </div>
      </RootDropZone>
    </DndContext>
  );
}

function RootDropZone({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: ROOT_DROP_ID });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-xl p-1 transition-colors",
        isOver && "bg-pritio-blue/5 ring-1 ring-inset ring-pritio-blue/30",
      )}
    >
      {children}
    </div>
  );
}