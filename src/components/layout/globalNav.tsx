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
  icon: React.ReactNode;
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
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M8 2.5V13.5M3.5 8H12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
    accent: { text: "text-pritio-blue", bg: "bg-pritio-blue", softBg: "bg-pritio-blue/10" },
  },
  {
    key: "mi-dia",
    path: "/mi-dia",
    label: "Mi día",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden>
        <rect x="2.5" y="3" width="11" height="10.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5.5 1.5V4.5M10.5 1.5V4.5M2.5 6.5h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="8" cy="9.5" r="1.5" fill="currentColor" />
      </svg>
    ),
    accent: { text: "text-pritio-green", bg: "bg-pritio-green", softBg: "bg-pritio-green/10" },
  },
  {
    key: "cuadrantes",
    path: "/cuadrantes",
    label: "Cuadrantes",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden>
        <rect x="1.5" y="1.5" width="13" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 1.5V14.5M1.5 8H14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    accent: { text: "text-pritio-purple", bg: "bg-pritio-purple", softBg: "bg-pritio-purple/10" },
  },
  {
    key: "calendario",
    path: "/calendario",
    label: "Calendario",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden>
        <rect x="2.5" y="3" width="11" height="10.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M2.5 6.5H13.5M5.5 1.5V4.5M10.5 1.5V4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    accent: { text: "text-pritio-coral", bg: "bg-pritio-coral", softBg: "bg-pritio-coral/10" },
  },
  {
    key: "proyectos",
    path: "/proyectos",
    label: "Proyectos",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3H6l1.5 1.5h5A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5v-7z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M5 4.5V11.5M9 4.5V11.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
    accent: { text: "text-pritio-blue", bg: "bg-pritio-blue", softBg: "bg-pritio-blue/10" },
  },
  {
    key: "docs",
    path: "/notas",
    label: "Notas",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M13.5 9.5c0 .8-.7 1.5-1.5 1.5H4l-2.5 2V3c0-.8.7-1.5 1.5-1.5h9c.8 0 1.5.7 1.5 1.5v6.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 7h6M5 9h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
    accent: { text: "text-pritio-purple", bg: "bg-pritio-purple", softBg: "bg-pritio-purple/10" },
  },
  {
    key: "indicadores",
    path: "/indicadores",
    label: "Indicadores",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M13.5 13.5V6.5a1 1 0 0 0-1-1h-9a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1z" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5 11.5V8M9 11.5V6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
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