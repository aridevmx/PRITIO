import { supabase } from "@/lib/supabase";
import type { Task } from "@/types";

export type FilterConditionType =
  | "quadrant"
  | "tag"
  | "overdue"
  | "dateRange"
  | "workspace"
  | "project"
  | "completed"
  | "myDay";

export type FilterCondition = {
  type: FilterConditionType;
  value: unknown;
  operator?: "equals" | "notEquals" | "contains" | "greaterThan" | "lessThan";
};

export type FilterActionType = "label" | "moveToQuadrant" | "addToMyDay" | "archive" | "delete";

export type FilterAction = {
  type: FilterActionType;
  value: unknown;
};

export interface UserFilter {
  id: string;
  userId: string;
  workspaceId: string | null;
  name: string;
  conditions: FilterCondition[];
  actions: FilterAction[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserFilterRow {
  id: string;
  user_id: string;
  workspace_id: string | null;
  name: string;
  conditions: FilterCondition[];
  actions: FilterAction[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function mapUserFilter(row: UserFilterRow): UserFilter {
  return {
    id: row.id,
    userId: row.user_id,
    workspaceId: row.workspace_id,
    name: row.name,
    conditions: row.conditions ?? [],
    actions: row.actions ?? [],
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listUserFilters(userId: string): Promise<UserFilter[]> {
  const { data, error } = await supabase
    .from("user_filters")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data as UserFilterRow[]).map(mapUserFilter);
}

export async function createUserFilter(
  userId: string,
  name: string,
  conditions: FilterCondition[],
  actions: FilterAction[],
  workspaceId?: string | null,
): Promise<UserFilter> {
  const { data, error } = await supabase
    .from("user_filters")
    .insert({
      user_id: userId,
      workspace_id: workspaceId ?? null,
      name,
      conditions,
      actions,
      is_active: true,
    })
    .select("*")
    .single();

  if (error) throw error;
  return mapUserFilter(data as UserFilterRow);
}

export async function updateUserFilter(
  id: string,
  updates: Partial<Pick<UserFilter, "name" | "conditions" | "actions" | "isActive">>,
): Promise<UserFilter> {
  const payload: Record<string, unknown> = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.conditions !== undefined) payload.conditions = updates.conditions;
  if (updates.actions !== undefined) payload.actions = updates.actions;
  if (updates.isActive !== undefined) payload.is_active = updates.isActive;

  const { data, error } = await supabase
    .from("user_filters")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return mapUserFilter(data as UserFilterRow);
}

export async function deleteUserFilter(id: string): Promise<void> {
  const { error } = await supabase
    .from("user_filters")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

export function applyFilterConditions(
  tasks: Task[],
  conditions: FilterCondition[],
): Task[] {
  return tasks.filter((task) => {
    return conditions.every((condition) => {
      switch (condition.type) {
        case "quadrant":
          return task.quadrant === condition.value;
        case "tag":
          // Tasks don't have tags yet, but we can check project as a tag
          return task.projectId === condition.value;
        case "overdue": {
          if (!task.dueDate) return false;
          const today = new Date();
          const due = new Date(task.dueDate + "T00:00:00");
          return due < today;
        }
        case "completed":
          return task.completed === condition.value;
        case "myDay":
          return task.myDayDate !== null;
        case "workspace":
          return task.workspaceId === condition.value;
        case "project":
          return task.projectId === condition.value;
        case "dateRange": {
          const range = condition.value as { start: string; end: string; field: string };
          const field = range.field as keyof Task;
          const taskDate = task[field] as string | null;
          if (!taskDate) return false;
          return taskDate >= range.start && taskDate <= range.end;
        }
        default:
          return true;
      }
    });
  });
}