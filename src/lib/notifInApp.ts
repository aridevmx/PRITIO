export type InAppDelivery = "both" | "toast" | "bell" | "off";

export const IN_APP_EVENTS: { kind: string; label: string }[] = [
  { kind: "task_assigned", label: "Tarea asignada" },
  { kind: "meeting_created", label: "Junta creada" },
  { kind: "deadline_approaching", label: "Fecha límite próxima" },
  { kind: "blocked_day_pending_approval", label: "Aprobación de día bloqueado" },
  { kind: "workspace_invitation", label: "Invitación a workspace" },
];

const STORAGE_KEY = "prio:inAppPrefs";

const DEFAULTS: Record<string, InAppDelivery> = {
  task_assigned: "both",
  meeting_created: "both",
  deadline_approaching: "both",
  blocked_day_pending_approval: "bell",
  workspace_invitation: "bell",
};

function readAll(): Record<string, InAppDelivery> {
  if (typeof localStorage === "undefined") return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Record<string, InAppDelivery>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function getInAppDelivery(kind: string): InAppDelivery {
  return readAll()[kind] ?? "bell";
}

export function setInAppDelivery(kind: string, value: InAppDelivery): void {
  const next = { ...readAll(), [kind]: value };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}
