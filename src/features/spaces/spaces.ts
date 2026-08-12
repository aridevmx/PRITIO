import type { WorkspaceType } from "@/types";

export type SpaceKey = "pendientes" | "personal" | "casa" | "trabajo";

export interface SpaceMeta {
  key: SpaceKey;
  dbValue: "Personal" | "Casa" | "Trabajo" | null;
  label: string;
  subtitle: string;
  description: string;
  accent: {
    text: string;
    bg: string;
    softBg: string;
    border: string;
    shellBg: string;
  };
}

export const SPACES: Record<SpaceKey, SpaceMeta> = {
  pendientes: {
    key: "pendientes",
    dbValue: null,
    label: "Pendientes",
    subtitle: "Tu foco personal",
    description:
      "Tus prioridades reales, lo programado para esta semana y las decisiones pendientes.",
    accent: {
      text: "text-space-pendientes-primary",
      bg: "bg-space-pendientes-primary",
      softBg: "bg-space-pendientes-soft",
      border: "border-space-pendientes-border",
      shellBg: "bg-shell-pendientes",
    },
  },
  personal: {
    key: "personal",
    dbValue: "Personal",
    label: "Personal",
    subtitle: "Tu espacio individual",
    description:
      "Todo tu trabajo individual en una vista clara, ligera y fácil de mover.",
    accent: {
      text: "text-space-personal-primary",
      bg: "bg-space-personal-primary",
      softBg: "bg-space-personal-soft",
      border: "border-space-personal-border",
      shellBg: "bg-shell-personal",
    },
  },
  casa: {
    key: "casa",
    dbValue: "Casa",
    label: "Familia",
    subtitle: "Lo compartido en familia",
    description:
      "Coordina con tu familia: responsables claros, tareas visibles y todos al tanto.",
    accent: {
      text: "text-space-casa-primary",
      bg: "bg-space-casa-primary",
      softBg: "bg-space-casa-soft",
      border: "border-space-casa-border",
      shellBg: "bg-shell-casa",
    },
  },
  trabajo: {
    key: "trabajo",
    dbValue: "Trabajo",
    label: "Trabajo",
    subtitle: "Proyectos y operación",
    description:
      "Cuadrantes, proyectos, personas y participantes en una sola vista.",
    accent: {
      text: "text-space-trabajo-primary",
      bg: "bg-space-trabajo-primary",
      softBg: "bg-space-trabajo-soft",
      border: "border-space-trabajo-border",
      shellBg: "bg-shell-trabajo",
    },
  },
};

export function spacesForWorkspaceType(type: WorkspaceType): SpaceMeta[] {
  switch (type) {
    case "personal":
      return [SPACES.pendientes, SPACES.personal];
    case "family":
      return [SPACES.casa];
    case "team":
      return [SPACES.trabajo];
  }
}

// ─── URL routing ──────────────────────────────────────

export const SPACE_SLUGS: Record<SpaceKey, string> = {
  pendientes: "pendiente",
  personal: "personal",
  casa: "familia",
  trabajo: "trabajo",
};

export const SLUG_TO_SPACE: Record<string, SpaceKey | undefined> = Object.fromEntries(
  Object.entries(SPACE_SLUGS).map(([k, v]) => [v, k]),
) as Record<string, SpaceKey | undefined>;

export function spacePath(space: SpaceKey, view?: string): string {
  const base = `/${SPACE_SLUGS[space]}`;
  return view ? `${base}/${view}` : base;
}
