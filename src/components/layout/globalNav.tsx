import {
  CalendarBlank,
  CalendarDots,
  ChartBar,
  Folder,
  Note,
  SquaresFour,
  Tray,
} from "@phosphor-icons/react";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";

export type GlobalViewKey =
  | "inbox"
  | "mi-dia"
  | "cuadrantes"
  | "calendario"
  | "proyectos"
  | "docs"
  | "indicadores";

export interface GlobalViewMeta {
  key: GlobalViewKey;
  path: string;
  label: string;
  /** El glifo se guarda como componente, no como nodo ya renderizado: así cada
   *  superficie decide tamaño y peso (activo vs. reposo) sin duplicar el SVG. */
  icon: PhosphorIcon;
  accent: {
    text: string;
    bg: string;
    softBg: string;
  };
}

export const GLOBAL_VIEWS: GlobalViewMeta[] = [
  {
    key: "inbox",
    path: "/inbox",
    label: "Inbox",
    icon: Tray,
    accent: { text: "text-pritio-blue", bg: "bg-pritio-blue", softBg: "bg-pritio-blue/10" },
  },
  {
    key: "mi-dia",
    path: "/mi-dia",
    label: "Mi día",
    icon: CalendarDots,
    accent: { text: "text-pritio-green", bg: "bg-pritio-green", softBg: "bg-pritio-green/10" },
  },
  {
    key: "cuadrantes",
    path: "/cuadrantes",
    label: "Cuadrantes",
    icon: SquaresFour,
    accent: { text: "text-pritio-purple", bg: "bg-pritio-purple", softBg: "bg-pritio-purple/10" },
  },
  {
    key: "calendario",
    path: "/calendario",
    label: "Calendario",
    icon: CalendarBlank,
    accent: { text: "text-pritio-coral", bg: "bg-pritio-coral", softBg: "bg-pritio-coral/10" },
  },
  {
    key: "proyectos",
    path: "/proyectos",
    label: "Proyectos",
    icon: Folder,
    accent: { text: "text-pritio-blue", bg: "bg-pritio-blue", softBg: "bg-pritio-blue/10" },
  },
  {
    key: "docs",
    path: "/notas",
    label: "Notas",
    icon: Note,
    accent: { text: "text-pritio-purple", bg: "bg-pritio-purple", softBg: "bg-pritio-purple/10" },
  },
  {
    key: "indicadores",
    path: "/indicadores",
    label: "Indicadores",
    icon: ChartBar,
    accent: { text: "text-pritio-green", bg: "bg-pritio-green", softBg: "bg-pritio-green/10" },
  },
];

export function globalViewFromPath(pathname: string): GlobalViewKey | null {
  switch (pathname) {
    case "/inbox":
      return "inbox";
    case "/mi-dia":
      return "mi-dia";
    case "/cuadrantes":
      return "cuadrantes";
    case "/calendario":
      return "calendario";
    case "/proyectos":
      return "proyectos";
    case "/notas":
      return "docs";
    case "/indicadores":
      return "indicadores";
    default:
      return null;
  }
}

export function globalViewPath(view: GlobalViewKey): string {
  return GLOBAL_VIEWS.find((v) => v.key === view)?.path ?? "/inbox";
}