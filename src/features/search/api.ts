import { supabase } from "@/lib/supabase";

export interface TaskSearchHit {
  id: string;
  workspaceId: string;
  title: string;
  completed: boolean;
  date: string | null;
}

export interface DocSearchHit {
  id: string;
  workspaceId: string;
  title: string;
  updatedAt: string;
}

export interface MemberSearchHit {
  id: string;
  workspaceId: string;
  name: string;
  color: string;
}

export interface GlobalSearchResults {
  tasks: TaskSearchHit[];
  meetings: TaskSearchHit[];
  events: TaskSearchHit[];
  docs: DocSearchHit[];
  members: MemberSearchHit[];
}

export const OPEN_DOC_EVENT = "pritio:open-doc";
export const FOCUS_MEMBER_EVENT = "pritio:focus-member";

const TASK_VIEW =
  "id, workspace_id, title, kind, completed, start_at, start_date, updated_at";

function sanitize(query: string): string {
  return query.trim().replace(/[%_\\*"']/g, "");
}

export async function searchGlobal(
  workspaceIds: string[],
  query: string,
): Promise<GlobalSearchResults> {
  const q = sanitize(query);
  const empty: GlobalSearchResults = {
    tasks: [],
    meetings: [],
    events: [],
    docs: [],
    members: [],
  };
  if (workspaceIds.length === 0 || !q) return empty;

  const [taskRows, docRows, memberRows] = await Promise.all([
    supabase
      .from("tasks")
      .select(TASK_VIEW)
      .in("workspace_id", workspaceIds)
      .ilike("title", `%${q}%`)
      .order("updated_at", { ascending: false })
      .limit(16),
    supabase
      .from("docs")
      .select("id, workspace_id, title, updated_at")
      .in("workspace_id", workspaceIds)
      .or(`title.ilike.%${q}%,content.ilike.%${q}%`)
      .order("updated_at", { ascending: false })
      .limit(6),
    supabase
      .from("assignees")
      .select("id, workspace_id, name, color")
      .in("workspace_id", workspaceIds)
      .ilike("name", `%${q}%`)
      .order("name", { ascending: true })
      .limit(6),
  ]);

  const tasks: TaskSearchHit[] = [];
  const meetings: TaskSearchHit[] = [];
  const events: TaskSearchHit[] = [];

  for (const row of (taskRows.data ?? []) as unknown as Record<string, unknown>[]) {
    const hit: TaskSearchHit = {
      id: row.id as string,
      workspaceId: row.workspace_id as string,
      title: (row.title as string) || "Sin título",
      completed: Boolean(row.completed),
      date: (row.start_at as string | null) ?? (row.start_date as string | null) ?? null,
    };
    const kind = row.kind as string;
    if (kind === "meeting") meetings.push(hit);
    else if (kind === "event") events.push(hit);
    else tasks.push(hit);
  }

  return {
    tasks,
    meetings,
    events,
    docs: ((docRows.data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
      id: row.id as string,
      workspaceId: row.workspace_id as string,
      title: (row.title as string) || "Sin título",
      updatedAt: (row.updated_at as string) || "",
    })),
    members: ((memberRows.data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
      id: row.id as string,
      workspaceId: row.workspace_id as string,
      name: (row.name as string) || "Miembro",
      color: (row.color as string) || "#5BA7D1",
    })),
  };
}

// ─── Destino pendiente ─────────────────────────────────────
// Un clic en un resultado navega primero y luego la vista destino
// consume el objetivo; el evento cubre la vista ya montada y el
// destino pendiente cubre la vista que se monta tras la navegación.

export type SearchPendingTarget =
  | { type: "doc"; docId: string }
  | { type: "member"; assigneeId: string };

const PENDING_TTL = 8000;
let pendingTarget: SearchPendingTarget | null = null;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleClear(target: SearchPendingTarget): void {
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => {
    if (pendingTarget === target) pendingTarget = null;
  }, PENDING_TTL);
}

export function setSearchPendingTarget(target: SearchPendingTarget): void {
  pendingTarget = target;
  scheduleClear(target);
}

export function takeSearchPendingTarget(): SearchPendingTarget | null {
  const current = pendingTarget;
  pendingTarget = null;
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  return current;
}