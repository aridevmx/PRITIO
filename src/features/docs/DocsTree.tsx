import { useEffect, useRef, useState } from "react";
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

/** Props de acción compartidas por todas las filas del árbol. */
type TreeCallbacks = Omit<DocsTreeProps, "nodes">;

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={cn("h-3 w-3 shrink-0 text-ink-muted transition-transform duration-150", open && "rotate-90")}
      viewBox="0 0 16 16"
      fill="none"
    >
      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const FolderGlyph = (
  <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="none">
    <path
      d="M2 5a1.5 1.5 0 011.5-1.5h2.6c.35 0 .68.15.91.41l.62.71c.23.26.56.41.9.41h3.47A1.5 1.5 0 0113.5 6.5v4A1.5 1.5 0 0112 12H3.5A1.5 1.5 0 012 10.5V5z"
      fill="currentColor"
      opacity="0.55"
    />
    <path
      d="M2 7h11.5"
      stroke="currentColor"
      strokeWidth="0.8"
      strokeLinecap="round"
      opacity="0.4"
    />
  </svg>
);

const DocGlyph = (
  <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="none">
    <path
      d="M4 2.5h5L12 5.5V13a.5.5 0 01-.5.5h-7A.5.5 0 014 13V2.5z"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
    <path d="M9 2.5V5.5H12" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
  </svg>
);

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
  const ref = useOutsideClose(open, () => setOpen(false));

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label="Opciones de carpeta"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="grid h-5 w-5 place-items-center rounded text-ink-muted opacity-0 transition-opacity hover:bg-surface-muted group-hover/folder:opacity-100"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="3.5" cy="8" r="1.2" />
          <circle cx="8" cy="8" r="1.2" />
          <circle cx="12.5" cy="8" r="1.2" />
        </svg>
      </button>
      {open && (
        <div className="pritio-menu-enter absolute right-0 top-full z-40 mt-1 min-w-[10rem] overflow-hidden rounded-lg border border-line bg-white py-1 shadow-elevated">
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
      )}
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
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
            <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
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

    // No soltar una carpeta sobre sí misma.
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
