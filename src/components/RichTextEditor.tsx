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
import DragHandle from "@tiptap/extension-drag-handle";
import { cn } from "@/lib/utils";
import {
  filterSlashItems,
  type SlashMenuItem,
} from "@/components/editor/SlashCommands";

interface RichTextEditorProps {
  content?: string | null;
  onChange?: (html: string) => void;
  editable?: boolean;
  placeholder?: string;
  className?: string;
  contentClassName?: string;
  /** Sin borde ni fondo: para editores de página completa (estilo Notion). */
  unstyled?: boolean;
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

const HeadingIcon = (
  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 5v14M13 5v14M5 12h8M17 9l3-1v11" />
  </svg>
);

const HeadingSmallIcon = (
  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 5v14M10 5v14M4 12h6M15 10l3-.8V19" />
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

export function RichTextEditor({
  content,
  onChange,
  editable = true,
  placeholder = "Escribe algo...",
  className,
  contentClassName,
  unstyled = false,
}: RichTextEditorProps) {
  const slashPropsRef = useRef<SuggestionProps<SlashMenuItem> | null>(null);
  const slashSelectedRef = useRef(0);
  const [slash, setSlash] = useState<{
    items: SlashMenuItem[];
    selected: number;
    top: number;
    left: number;
  } | null>(null);

  // Elemento para el asa de arrastre de bloques (DragHandle de Tiptap).
  const dragHandleElRef = useRef<HTMLDivElement | null>(null);
  if (typeof document !== "undefined" && !dragHandleElRef.current) {
    const el = document.createElement("div");
    el.className =
      "grid h-6 w-6 place-items-center rounded-md border border-line bg-surface text-ink-muted shadow-soft cursor-grab hover:text-ink hover:border-line-strong active:cursor-grabbing";
    el.title = "Arrastrar bloque";
    el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>`;
    dragHandleElRef.current = el;
  }
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
      const estimatedHeight = Math.min(items.length * 44 + 12, 300);
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
        heading: { levels: [2, 3] },
      }),
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

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            bold: e.isActive("bold"),
            italic: e.isActive("italic"),
            heading: e.isActive("heading", { level: 2 }),
            headingSmall: e.isActive("heading", { level: 3 }),
            bulletList: e.isActive("bulletList"),
            orderedList: e.isActive("orderedList"),
            blockquote: e.isActive("blockquote"),
            codeBlock: e.isActive("codeBlock"),
            link: e.isActive("link"),
          }
        : null,
  });

  useEffect(() => {
    if (!editor || content === undefined || content === null) return;
    if (content === editor.getHTML()) return;
    editor.commands.setContent(content, { emitUpdate: false });
  }, [content, editor]);

  useEffect(() => {
    if (editor && editor.isEditable !== editable) editor.setEditable(editable);
  }, [editable, editor]);

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
          <ToolButton active={state?.heading} label="Título" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
            {HeadingIcon}
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
          <div
            className="fixed z-[10000] w-64"
            style={{ top: slash.top, left: slash.left }}
          >
            <div className="pritio-menu-enter max-h-[18rem] overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-elevated">
              {slash.items.map((item, i) => (
                <button
                  key={item.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => runSlashItem(item)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors",
                    i === slash.selected ? "bg-surface-muted" : "hover:bg-surface-muted/60",
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
              <ToolButton active={state?.heading} label="Título 1" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
                {HeadingIcon}
              </ToolButton>
              <ToolButton active={state?.headingSmall} label="Título 2" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
                {HeadingSmallIcon}
              </ToolButton>
              <ToolButton active={state?.bulletList} label="Lista con viñetas" onClick={() => editor.chain().focus().toggleBulletList().run()}>
                {BulletListIcon}
              </ToolButton>
              <ToolButton active={state?.orderedList} label="Lista numerada" onClick={() => editor.chain().focus().toggleOrderedList().run()}>
                {OrderedListIcon}
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
            </div>
          </BubbleMenu>,
          document.body,
        )}

      <EditorContent editor={editor} className={cn("px-3 py-2.5", contentClassName)} />
    </div>
  );
}
