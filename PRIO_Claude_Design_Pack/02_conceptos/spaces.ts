import type { WorkspaceType } from "@/features/workspaces/WorkspaceProvider";

export type SpaceKey = "pendientes" | "personal" | "casa" | "trabajo";

export interface SpaceMeta {
  key: SpaceKey;
  /** DB enum value for `space` column. Pendientes is virtual (no DB value). */
  dbValue: "Personal" | "Casa" | "Trabajo" | null;
  label: string;
  subtitle: string;
  description: string;
  /** Tailwind class hooks for primary accents */
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

/**
 * Spaces visibles dentro de un workspace, en orden de display.
 * Pendientes es una vista cross-workspace; antes vivia en una
 * seccion "Foco" global del sidebar. A partir de 2026-05-12 lo
 * movimos solo al workspace Personal: ahi es donde el usuario
 * piensa sus pendientes globales. En team/family no aparece — la
 * vista de pendientes cross-workspace se accede entrando a
 * Personal.
 *
 * 2026-05-18: removido `casa` del workspace personal — la vida
 * compartida en familia vive en el workspace family, no como un
 * sub-space del personal. En personal el sidebar muestra solo
 * Pendientes + Personal.
 */
export function spacesForWorkspaceType(type: WorkspaceType): SpaceMeta[] {
  switch (type) {
    case "personal":
      return [SPACES.pendientes, SPACES.personal];
    case "family":
      return [SPACES.casa];
    case "team":
      return [SPACES.trabajo];
    case "enterprise":
      // Enterprise se configura por contrato. Mostramos los 3 por default
      // hasta que tengamos config dinamica.
      return [SPACES.trabajo, SPACES.personal, SPACES.casa];
  }
}
