import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import type { Editor, Range } from "@tiptap/core";
import { Extension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import Suggestion from "@tiptap/suggestion";
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import { Table } from "@tiptap/extension-table";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableRow } from "@tiptap/extension-table-row";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Highlight } from "@tiptap/extension-highlight";
import { Image } from "@tiptap/extension-image";
import { NodeRange } from "@tiptap/extension-node-range";
import DragHandle from "@tiptap/extension-drag-handle";
import { cn } from "@/lib/utils";
import {
  filterSlashItems,
  SLASH_ITEMS,
  type SlashMenuItem,
} from "@/components/editor/SlashCommands";

/** Elemento del índice de títulos (outline estilo Notion). */
export interface DocOutlineItem {
  level: 1 | 2 | 3;
  text: string;
}

interface RichTextEditorProps {
  content?: string | null;
  onChange?: (html: string) => void;
  editable?: boolean;
  placeholder?: string;
  className?: string;
  contentClassName?: string;
  /** Sin borde ni fondo: para editores de página completa (estilo Notion). */
  unstyled?: boolean;
  /** Notificado cuando cambian los encabezados H1-H3 del documento. */
  onOutline?: (items: DocOutlineItem[]) => void;
}

function ToolButton({
  active,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "grid h-7 w-7 place-items-center rounded-md text-ink-soft transition-colors hover:bg-surface-muted hover:text-ink",
        active && "bg-pritio-blue/10 text-pritio-blue hover:bg-pritio-blue/15 hover:text-pritio-blue",
      )}
    >
      {children}
    </button>
  );
}

const BoldIcon = (
  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 4h7a3.5 3.5 0 0 1 0 7H6zM6 11h8a3.75 3.75 0 0 1 0 7.5H6z" />
  </svg>
);

const ItalicIcon = (
  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 4h-9M14 20H5M15 4L9 20" />
  </svg>
);

const UnderlineIcon = (
  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 4v6a6 6 0 0 0 12 0V4M4.5 20h15" />
  </svg>
);

const StrikeIcon = (
  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M16 7c-.7-1.7-2.2-2.5-4.3-2.5C9 4.5 7.2 5.6 7.2 7.7c0 1.3.6 2.2 1.8 2.9M8 17c.8 1.7 2.4 2.6 4.6 2.6 2.9 0 4.6-1.3 4.6-3.4 0-.9-.3-1.6-.8-2.2" />
  </svg>
);

const InlineCodeIcon = (
  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 6L3 12l6 6M15 6l6 6-6 6" />
  </svg>
);

const HighlightIcon = (
  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 20h16M9.5 15.5L18.6 6.4a2.1 2.1 0 0 0-3-3L6.5 12.5l-1 4z" />
  </svg>
);

const H1Icon = (
  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 5v14M11 5v14M4 12h7M17.5 9.5l2.5-1.5V19" />
  </svg>
);

const H2Icon = (
  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 5v14M10 5v14M4 12h6M15 10l3-1v10M14 15.5h4" />
  </svg>
);

const H3Icon = (
  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 5v14M9.5 5v14M4 12h5.5M15 9.5l2.8-.9V19M14 13.8h3.8M14 17h3.8" />
  </svg>
);

const BulletListIcon = (
  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 6h13M8 12h13M8 18h13" />
    <circle cx="3.5" cy="6" r="1" fill="currentColor" stroke="none" />
    <circle cx="3.5" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="3.5" cy="18" r="1" fill="currentColor" stroke="none" />
  </svg>
);

const OrderedListIcon = (
  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 6h11M10 12h11M10 18h11M4 5.5L5.5 4.5V9M4 14h2.5c.6 0 1 .4 1 .9 0 .5-.4 1-1 1H5.4c-.8 0-1.4.6-1.4 1.3 0 .5.4.8 1 .8h1.8" />
  </svg>
);

const TaskListIcon = (
  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3.5" y="4.5" width="7" height="7" rx="1.5" />
    <path d="M5.2 8l1.6 1.6L9.8 6.6" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
    <path d="M14 8h7M14 17h7" />
  </svg>
);

const QuoteIcon = (
  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 6v12M8 6h13M8 12h13M8 18h8" />
  </svg>
);

const CodeIcon = (
  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 6L3 12l5 6M16 6l5 6-5 6" />
  </svg>
);

const LinkIcon = (
  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

const ClearFormatIcon = (
  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 4h12M12 4l-4 13M8 21h8M9.5 17H14" />
  </svg>
);

export function RichTextEditor({
  content,
  onChange,
  editable = true,
  placeholder = "Escribe algo...",
  className,
  contentClassName,
  unstyled = false,
  onOutline,
}: RichTextEditorProps) {
  const slashPropsRef = useRef<SuggestionProps<SlashMenuItem> | null>(null);
  const slashSelectedRef = useRef(0);
  const [slash, setSlash] = useState<{
    items: SlashMenuItem[];
    selected: number;
    top: number;
    left: number;
  } | null>(null);

  // ── Asa de arrastre + botón "+" (DragHandle de Tiptap) ────────
  const [plusMenu, setPlusMenu] = useState<{ top: number; left: number } | null>(null);
  const dragInfoRef = useRef<{ pos: number; size: number }>({ pos: -1, size: 0 });
  const editorRef = useRef<Editor | null>(null);

  const dragHandleElRef = useRef<HTMLDivElement | null>(null);
  if (typeof document !== "undefined" && !dragHandleElRef.current) {
    const wrap = document.createElement("div");
    wrap.className = "flex items-center gap-1";
    wrap.style.pointerEvents = "auto";

    const drag = document.createElement("div");
    drag.className =
      "grid h-6 w-6 place-items-center rounded-md border border-line bg-surface text-ink-muted shadow-soft cursor-grab hover:text-ink hover:border-line-strong active:cursor-grabbing";
    drag.title = "Arrastrar bloque";
    drag.setAttribute("aria-hidden", "true");
    drag.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>`;

    const plus = document.createElement("button");
    plus.type = "button";
    plus.setAttribute("data-plus", "true");
    plus.title = "Insertar bloque";
    plus.className =
      "grid h-6 w-6 place-items-center rounded-md border border-line bg-surface text-ink-muted shadow-soft transition-colors hover:text-ink hover:border-pritio-blue/50";
    plus.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`;

    // Evitar que el botón "+" inicie un arrastre de bloque.
    wrap.addEventListener("dragstart", (e) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("[data-plus]")) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    });
    plus.addEventListener("mousedown", (e) => e.stopPropagation());

    wrap.append(drag, plus);
    dragHandleElRef.current = wrap;
  }
  useEffect(() => {
    const wrap = dragHandleElRef.current;
    const plus = wrap?.querySelector<HTMLButtonElement>("[data-plus]");
    if (!wrap || !plus) return;
    const open = () => {
      const rect = wrap.getBoundingClientRect();
      // Calcular posición del bloque actual en la posición del asa.
      if (editorRef.current) {
        const coords = editorRef.current.view.posAtCoords({
          left: rect.left + rect.width / 2,
          top: rect.top,
        });
        if (coords) {
          const node = editorRef.current.state.doc.nodeAt(coords.pos);
          dragInfoRef.current = { pos: coords.pos, size: node?.nodeSize ?? 0 };
        }
      }
      setPlusMenu({
        top: rect.bottom + 6,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - 288 - 8)),
      });
    };
    plus.addEventListener("click", open);
    return () => plus.removeEventListener("click", open);
  }, []);

  // Cerrar el menú "+" con click fuera o Escape.
  useEffect(() => {
    if (!plusMenu) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("[data-plus-wrap],[data-plus-menu]")) return;
      setPlusMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        setPlusMenu(null);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [plusMenu]);

  useEffect(() => {
    return () => {
      dragHandleElRef.current?.remove();
    };
  }, []);

  // ── Render del menú "/" ───────────────────────────────────────
  const syncSlashSelection = () => {
    setSlash((prev) => (prev ? { ...prev, selected: slashSelectedRef.current } : prev));
  };

  const updateSlashFromProps = (props: SuggestionProps<SlashMenuItem>) => {
    slashPropsRef.current = props;
    const items = filterSlashItems(props.query);
    if (slashSelectedRef.current >= items.length) slashSelectedRef.current = 0;

    // Posición fija relativa a viewport: evita que ancestros con overflow recorten el menú.
    let top = 0;
    let left = 0;
    const rect = props.clientRect?.();
    if (rect) {
      const estimatedHeight = Math.min(items.length * 44 + 12, 340);
      top = rect.bottom + 6;
      if (top + estimatedHeight > window.innerHeight - 8 && rect.top > estimatedHeight + 8) {
        top = rect.top - estimatedHeight - 6;
      }
      left = Math.max(8, Math.min(rect.left, window.innerWidth - 288 - 8));
    }
    setSlash({ items, selected: slashSelectedRef.current, top, left });
  };

  const runSlashItem = (item: SlashMenuItem) => {
    const props = slashPropsRef.current;
    if (!props) return;
    item.command({ editor: props.editor as Editor, range: props.range as Range });
    setSlash(null);
    slashPropsRef.current = null;
  };

  const slashRender = useMemo(
    () => () => ({
      onStart: (props: SuggestionProps<SlashMenuItem>) => {
        slashSelectedRef.current = 0;
        updateSlashFromProps(props);
      },
      onUpdate: (props: SuggestionProps<SlashMenuItem>) => {
        updateSlashFromProps(props);
      },
      onKeyDown: ({ event }: SuggestionKeyDownProps) => {
        const items = filterSlashItems(slashPropsRef.current?.query ?? "");
        if (items.length === 0) return false;
        if (event.key === "ArrowDown") {
          slashSelectedRef.current = (slashSelectedRef.current + 1) % items.length;
          syncSlashSelection();
          return true;
        }
        if (event.key === "ArrowUp") {
          slashSelectedRef.current =
            (slashSelectedRef.current - 1 + items.length) % items.length;
          syncSlashSelection();
          return true;
        }
        if (event.key === "Enter") {
          runSlashItem(items[slashSelectedRef.current]);
          return true;
        }
        return false;
      },
      onExit: () => {
        setSlash(null);
        slashPropsRef.current = null;
      },
    }),
    [],
  );

  const slashExtension = useMemo(
    () =>
      Extension.create({
        name: "slashCommands",
        addProseMirrorPlugins() {
          return [
            Suggestion<SlashMenuItem>({
              editor: this.editor,
              char: "/",
              allowedPrefixes: null,
              startOfLine: false,
              items: ({ query }) => filterSlashItems(query),
              command: ({ editor, range, props }) => props.command({ editor, range }),
              render: () => slashRender(),
            }),
          ];
        },
      }),
    [slashRender],
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      // Selección por bloques: necesaria para que el drag handle mueva bloques completos.
      NodeRange,
      Highlight.configure({ multicolor: true }),
      Image.configure({ inline: false, allowBase64: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name !== "paragraph") return unstyled ? "Encabezado" : "";
          return unstyled ? "Escribe '/' para comandos…" : placeholder;
        },
      }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      slashExtension,
      ...(dragHandleElRef.current
        ? [
            DragHandle.configure({
              render: () => dragHandleElRef.current!,
            }),
          ]
        : []),
    ],
    content: content ?? "",
    editable,
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange?.(editor.getHTML()),
    editorProps: {
      attributes: {
        class: "pritio-prose-content focus:outline-none",
      },
    },
  });

  // Ejecutar un ítem del menú "+" sobre el bloque actual del asa.
  const runPlusItem = (item: SlashMenuItem) => {
    if (!editor) return;
    const { pos, size } = dragInfoRef.current;
    setPlusMenu(null);
    if (pos < 0) return;
    const endPos = Math.min(pos + Math.max(size - 1, 0), editor.state.doc.content.size);
    editor.chain().focus().setTextSelection(Math.max(endPos, 1)).run();
    item.command({ editor: editor as Editor, range: { from: endPos, to: endPos } as Range });
  };

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            bold: e.isActive("bold"),
            italic: e.isActive("italic"),
            underline: e.isActive("underline"),
            strike: e.isActive("strike"),
            code: e.isActive("code"),
            highlight: e.isActive("highlight"),
            h1: e.isActive("heading", { level: 1 }),
            h2: e.isActive("heading", { level: 2 }),
            h3: e.isActive("heading", { level: 3 }),
            bulletList: e.isActive("bulletList"),
            orderedList: e.isActive("orderedList"),
            taskList: e.isActive("taskList"),
            blockquote: e.isActive("blockquote"),
            codeBlock: e.isActive("codeBlock"),
            link: e.isActive("link"),
          }
        : null,
  });

  // Sincronizar contenido externo (nunca mientras el usuario escribe).
  useEffect(() => {
    if (!editor || content === undefined || content === null) return;
    if (editor.isDestroyed || editor.isFocused) return;
    if (content === editor.getHTML()) return;
    editor.commands.setContent(content, { emitUpdate: false });
  }, [content, editor]);

  useEffect(() => {
    if (editor && editor.isEditable !== editable) editor.setEditable(editable);
  }, [editable, editor]);

  // ── Índice de títulos (outline) ───────────────────────────────
  const onOutlineRef = useRef(onOutline);
  useEffect(() => {
    onOutlineRef.current = onOutline;
  }, [onOutline]);

  useEffect(() => {
    if (!editor) return;
    let lastKey = "";
    const compute = () => {
      const items: DocOutlineItem[] = [];
      editor.state.doc.descendants((node) => {
        if (node.type.name === "heading") {
          const level = Number(node.attrs.level) as 1 | 2 | 3;
          if (level >= 1 && level <= 3) {
            items.push({ level, text: node.textContent.trim() || "Sin título" });
          }
        }
        return true;
      });
      const key = items.map((i) => `${i.level}:${i.text}`).join("|");
      if (key !== lastKey) {
        lastKey = key;
        onOutlineRef.current?.(items);
      }
    };
    compute();
    editor.on("update", compute);
    return () => {
      editor.off("update", compute);
    };
  }, [editor]);

  if (!editor) {
    return (
      <div
        className={cn(
          unstyled
            ? "flex flex-col"
            : "rounded-xl border border-line bg-surface-subtle",
          contentClassName ?? "min-h-[4.75rem]",
          className,
        )}
      />
    );
  }

  const insertMenu = (menu: { top: number; left: number }, items: SlashMenuItem[], selected: number, onPick: (item: SlashMenuItem) => void, onHover: (i: number) => void) => (
    <div
      className="fixed z-[10000] w-64"
      style={{ top: menu.top, left: menu.left }}
    >
      <div className="pritio-menu-enter max-h-[18rem] overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-elevated">
        {items.map((item, i) => (
          <button
            key={item.id}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(item)}
            onMouseEnter={() => onHover(i)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors",
              i === selected ? "bg-surface-muted" : "hover:bg-surface-muted/60",
            )}
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-line bg-surface-subtle text-ink-soft">
              {item.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium leading-tight text-ink">
                {item.label}
              </span>
              <span className="block truncate text-[11px] leading-tight text-ink-muted">
                {item.hint}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div
      className={cn(
        unstyled
          ? "flex flex-col"
          : "rounded-xl border border-line bg-surface-subtle transition-shadow focus-within:border-pritio-blue focus-within:ring-2 focus-within:ring-pritio-blue/20",
        className,
      )}
    >
      {editable && !unstyled && (
        <div className="flex items-center gap-0.5 overflow-x-auto border-b border-line px-1.5 py-1">
          <ToolButton active={state?.bold} label="Negrita (Ctrl+B)" onClick={() => editor.chain().focus().toggleBold().run()}>
            {BoldIcon}
          </ToolButton>
          <ToolButton active={state?.italic} label="Cursiva (Ctrl+I)" onClick={() => editor.chain().focus().toggleItalic().run()}>
            {ItalicIcon}
          </ToolButton>
          <ToolButton active={state?.underline} label="Subrayado (Ctrl+U)" onClick={() => editor.chain().focus().toggleUnderline().run()}>
            {UnderlineIcon}
          </ToolButton>
          <ToolButton active={state?.strike} label="Tachado" onClick={() => editor.chain().focus().toggleStrike().run()}>
            {StrikeIcon}
          </ToolButton>
          <ToolButton active={state?.h1} label="Título 1" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
            {H1Icon}
          </ToolButton>
          <ToolButton active={state?.h2} label="Título 2" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
            {H2Icon}
          </ToolButton>
          <ToolButton active={state?.bulletList} label="Lista con viñetas" onClick={() => editor.chain().focus().toggleBulletList().run()}>
            {BulletListIcon}
          </ToolButton>
          <ToolButton active={state?.orderedList} label="Lista numerada" onClick={() => editor.chain().focus().toggleOrderedList().run()}>
            {OrderedListIcon}
          </ToolButton>
        </div>
      )}

      {/* Menú "/" estilo Notion — portal fijo para que nunca se recorte */}
      {editable &&
        slash &&
        slash.items.length > 0 &&
        createPortal(
          <div data-slash-menu>
            {insertMenu(slash, slash.items, slash.selected, runSlashItem, (i) => {
              slashSelectedRef.current = i;
              syncSlashSelection();
            })}
          </div>,
          document.body,
        )}

      {/* Menú "+" del asa de bloques */}
      {editable &&
        plusMenu &&
        createPortal(
          <div data-plus-menu>
            {insertMenu(plusMenu, SLASH_ITEMS, 0, runPlusItem, () => {})}
          </div>,
          document.body,
        )}

      {/* Burbuja de selección — portal fijo para que nunca se recorte */}
      {editable &&
        createPortal(
          <BubbleMenu
            editor={editor}
            shouldShow={({ from, to }) => from !== to}
            options={{ placement: "top", strategy: "fixed", offset: 10 }}
          >
            <div className="flex items-center gap-0.5 rounded-xl border border-line bg-surface p-1 shadow-elevated">
              <ToolButton active={state?.bold} label="Negrita" onClick={() => editor.chain().focus().toggleBold().run()}>
                {BoldIcon}
              </ToolButton>
              <ToolButton active={state?.italic} label="Cursiva" onClick={() => editor.chain().focus().toggleItalic().run()}>
                {ItalicIcon}
              </ToolButton>
              <ToolButton active={state?.underline} label="Subrayado" onClick={() => editor.chain().focus().toggleUnderline().run()}>
                {UnderlineIcon}
              </ToolButton>
              <ToolButton active={state?.strike} label="Tachado" onClick={() => editor.chain().focus().toggleStrike().run()}>
                {StrikeIcon}
              </ToolButton>
              <ToolButton active={state?.code} label="Código en línea" onClick={() => editor.chain().focus().toggleCode().run()}>
                {InlineCodeIcon}
              </ToolButton>
              <ToolButton active={state?.highlight} label="Resaltado" onClick={() => editor.chain().focus().toggleHighlight().run()}>
                {HighlightIcon}
              </ToolButton>
              <span className="mx-0.5 h-5 w-px bg-line" aria-hidden="true" />
              <ToolButton active={state?.h1} label="Título 1" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
                {H1Icon}
              </ToolButton>
              <ToolButton active={state?.h2} label="Título 2" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
                {H2Icon}
              </ToolButton>
              <ToolButton active={state?.h3} label="Título 3" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
                {H3Icon}
              </ToolButton>
              <span className="mx-0.5 h-5 w-px bg-line" aria-hidden="true" />
              <ToolButton active={state?.bulletList} label="Lista con viñetas" onClick={() => editor.chain().focus().toggleBulletList().run()}>
                {BulletListIcon}
              </ToolButton>
              <ToolButton active={state?.orderedList} label="Lista numerada" onClick={() => editor.chain().focus().toggleOrderedList().run()}>
                {OrderedListIcon}
              </ToolButton>
              <ToolButton active={state?.taskList} label="Lista de tareas" onClick={() => editor.chain().focus().toggleTaskList().run()}>
                {TaskListIcon}
              </ToolButton>
              <ToolButton active={state?.blockquote} label="Cita" onClick={() => editor.chain().focus().toggleBlockquote().run()}>
                {QuoteIcon}
              </ToolButton>
              <ToolButton active={state?.codeBlock} label="Bloque de código" onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
                {CodeIcon}
              </ToolButton>
              <ToolButton
                active={state?.link}
                label="Enlace"
                onClick={() => {
                  if (state?.link) {
                    editor.chain().focus().unsetLink().run();
                  } else {
                    const url = window.prompt("URL del enlace:");
                    if (url?.trim()) {
                      editor.chain().focus().setLink({ href: url.trim() }).run();
                    }
                  }
                }}
              >
                {LinkIcon}
              </ToolButton>
              <span className="mx-0.5 h-5 w-px bg-line" aria-hidden="true" />
              <ToolButton
                label="Limpiar formato"
                onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
              >
                {ClearFormatIcon}
              </ToolButton>
            </div>
          </BubbleMenu>,
          document.body,
        )}

      <EditorContent editor={editor} className={cn("px-3 py-2.5", contentClassName)} />
    </div>
  );
}
