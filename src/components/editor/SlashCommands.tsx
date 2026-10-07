import type { ReactNode } from "react";
import type { Editor, Range } from "@tiptap/core";
import { AppIcon } from "@/components/AppIcon";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import {
  Code,
  Image,
  ListBullets,
  ListChecks,
  ListNumbers,
  Minus,
  Quotes,
  Table,
  TextAlignLeft,
  TextHOne,
  TextHThree,
  TextHTwo,
} from "@phosphor-icons/react";

export interface SlashMenuItem {
  id: string;
  label: string;
  hint: string;
  keywords: string[];
  icon: ReactNode;
  command: ({ editor, range }: { editor: Editor; range: Range }) => void;
}

const glyph = (icon: PhosphorIcon) => <AppIcon glyph={icon} weight="bold" />;

export const SLASH_ITEMS: SlashMenuItem[] = [
  {
    id: "texto",
    label: "Texto",
    hint: "Párrafo simple",
    keywords: ["texto", "parrafo", "p"],
    icon: glyph(TextAlignLeft),
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode("paragraph").run(),
  },
  {
    id: "titulo1",
    label: "Título 1",
    hint: "Encabezado grande (H1)",
    keywords: ["titulo", "encabezado", "h1", "grande"],
    icon: glyph(TextHOne),
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 1 }).run(),
  },
  {
    id: "titulo2",
    label: "Título 2",
    hint: "Encabezado mediano (H2)",
    keywords: ["titulo", "encabezado", "h2", "mediano"],
    icon: glyph(TextHTwo),
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 2 }).run(),
  },
  {
    id: "titulo3",
    label: "Título 3",
    hint: "Encabezado pequeño (H3)",
    keywords: ["titulo", "encabezado", "h3", "pequeno"],
    icon: glyph(TextHThree),
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 3 }).run(),
  },
  {
    id: "lista-vinetas",
    label: "Lista con viñetas",
    hint: "Lista sin orden",
    keywords: ["lista", "vinetas", "bullets"],
    icon: glyph(ListBullets),
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    id: "lista-numerada",
    label: "Lista numerada",
    hint: "Lista con orden",
    keywords: ["lista", "numerada", "orden"],
    icon: glyph(ListNumbers),
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    id: "lista-tareas",
    label: "Lista de tareas",
    hint: "Casillas de verificación",
    keywords: ["tarea", "todo", "checkbox", "casilla", "pendiente"],
    icon: glyph(ListChecks),
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    id: "cita",
    label: "Cita",
    hint: "Texto destacado",
    keywords: ["cita", "quote", "destacado"],
    icon: glyph(Quotes),
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    id: "codigo",
    label: "Código",
    hint: "Bloque de código",
    keywords: ["codigo", "code", "snippet"],
    icon: glyph(Code),
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    id: "imagen",
    label: "Imagen",
    hint: "Insertar desde URL",
    keywords: ["imagen", "foto", "picture", "img"],
    icon: glyph(Image),
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
    icon: glyph(Table),
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).insertTable({ rows: 2, cols: 3, withHeaderRow: true }).run(),
  },
  {
    id: "divisor",
    label: "Divisor",
    hint: "Línea horizontal",
    keywords: ["divisor", "linea", "separador", "hr"],
    icon: glyph(Minus),
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
