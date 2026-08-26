import type { ReactNode } from "react";
import type { Editor, Range } from "@tiptap/core";

export interface SlashMenuItem {
  id: string;
  label: string;
  hint: string;
  keywords: string[];
  icon: ReactNode;
  command: ({ editor, range }: { editor: Editor; range: Range }) => void;
}

const glyph = (path: ReactNode) => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {path}
  </svg>
);

export const SLASH_ITEMS: SlashMenuItem[] = [
  {
    id: "texto",
    label: "Texto",
    hint: "Párrafo simple",
    keywords: ["texto", "parrafo", "p"],
    icon: glyph(<path d="M5 6h14M5 12h14M5 18h9" />),
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode("paragraph").run(),
  },
  {
    id: "titulo1",
    label: "Título 1",
    hint: "Encabezado grande (H1)",
    keywords: ["titulo", "encabezado", "h1", "grande"],
    icon: glyph(<path d="M5 4v16M15 4v16M5 12h10M19 9v11" />),
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 1 }).run(),
  },
  {
    id: "titulo2",
    label: "Título 2",
    hint: "Encabezado mediano (H2)",
    keywords: ["titulo", "encabezado", "h2", "mediano"],
    icon: glyph(<path d="M4 4v16M11 4v16M4 12h7M17 9l3-1v12" />),
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 2 }).run(),
  },
  {
    id: "titulo3",
    label: "Título 3",
    hint: "Encabezado pequeño (H3)",
    keywords: ["titulo", "encabezado", "h3", "pequeno"],
    icon: glyph(<path d="M4 4v16M10 4v16M4 12h6M16 9l3-.9v11M14.5 13h4.5" />),
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 3 }).run(),
  },
  {
    id: "lista-vinetas",
    label: "Lista con viñetas",
    hint: "Lista sin orden",
    keywords: ["lista", "vinetas", "bullets"],
    icon: glyph(
      <>
        <path d="M9 6h11M9 12h11M9 18h11" />
        <circle cx="4.5" cy="6" r="1" fill="currentColor" stroke="none" />
        <circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="4.5" cy="18" r="1" fill="currentColor" stroke="none" />
      </>,
    ),
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    id: "lista-numerada",
    label: "Lista numerada",
    hint: "Lista con orden",
    keywords: ["lista", "numerada", "orden"],
    icon: glyph(<path d="M10 6h10M10 12h10M10 18h10M4 5l1.5-1V8M4 13.5h2.5c.6 0 1 .4 1 .9 0 .5-.4 1-1 1H5.5c-.8 0-1.4.6-1.4 1.3 0 .5.4.8 1 .8H7" />),
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    id: "lista-tareas",
    label: "Lista de tareas",
    hint: "Casillas de verificación",
    keywords: ["tarea", "todo", "checkbox", "casilla", "pendiente"],
    icon: glyph(
      <>
        <rect x="3.5" y="4.5" width="7" height="7" rx="1.5" />
        <path d="M5.2 8l1.6 1.6L9.8 6.6" />
        <rect x="3.5" y="14.5" width="7" height="7" rx="1.5" />
        <path d="M14 8h7M14 18h7" />
      </>,
    ),
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    id: "cita",
    label: "Cita",
    hint: "Texto destacado",
    keywords: ["cita", "quote", "destacado"],
    icon: glyph(<path d="M7 7h10M7 12h10M7 17h5" />),
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    id: "codigo",
    label: "Código",
    hint: "Bloque de código",
    keywords: ["codigo", "code", "snippet"],
    icon: glyph(<path d="M8 6L3 12l5 6M16 6l5 6-5 6" />),
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    id: "imagen",
    label: "Imagen",
    hint: "Insertar desde URL",
    keywords: ["imagen", "foto", "picture", "img"],
    icon: glyph(
      <>
        <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
        <circle cx="9" cy="10" r="1.6" />
        <path d="M20.5 15.5l-4.5-4.5-8 8.5" />
      </>,
    ),
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      const url = window.prompt("URL de la imagen:");
      if (url?.trim()) {
        void editor.chain().focus().setImage({ src: url.trim() }).run();
      }
    },
  },
  {
    id: "tabla",
    label: "Tabla",
    hint: "Cuadrícula 3×2",
    keywords: ["tabla", "cuadricula", "grid", "celdas"],
    icon: glyph(
      <>
        <rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
        <path d="M4 10h16M4 16h16M10 4v16M16 4v16" stroke="currentColor" strokeWidth="1.4" />
      </>,
    ),
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).insertTable({ rows: 2, cols: 3, withHeaderRow: true }).run(),
  },
  {
    id: "divisor",
    label: "Divisor",
    hint: "Línea horizontal",
    keywords: ["divisor", "linea", "separador", "hr"],
    icon: glyph(<path d="M4 12h16" />),
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
];

export function filterSlashItems(query: string): SlashMenuItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return SLASH_ITEMS;
  return SLASH_ITEMS.filter(
    (item) =>
      item.label.toLowerCase().includes(q) ||
      item.keywords.some((k) => k.includes(q)),
  );
}
