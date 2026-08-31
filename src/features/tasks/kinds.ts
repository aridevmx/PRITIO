import type { TaskKind, WorkspaceType } from "@/types";

/**
 * Kinds de tarea permitidos por tipo de workspace.
 * - Personal: puede ver y crear todo (tareas, eventos y juntas).
 * - Equipo: solo tareas y juntas (reuniones).
 * - Familia: solo tareas y eventos.
 */
export function allowedKindsForWorkspace(
  type: WorkspaceType | string | undefined,
): TaskKind[] {
  switch (type) {
    case "personal":
      return ["task", "meeting", "event"];
    case "team":
      return ["task", "meeting"];
    case "family":
      return ["task", "event"];
    default:
      return ["task", "meeting", "event"];
  }
}
