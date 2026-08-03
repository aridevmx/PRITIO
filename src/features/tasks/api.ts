import { supabase } from "@/lib/supabase";
import { TASK_COLUMNS, mapTask } from "@/lib/mappers";
import type { Task, CreateTaskPayload, UpdateTaskPayload } from "@/types";

export async function listTasks(workspaceId: string): Promise<Task[]> {
  const { data: taskRows, error } = await supabase
    .from("tasks")
    .select(TASK_COLUMNS)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const taskIds = (taskRows as unknown as Record<string, unknown>[] | null ?? []).map((r) => r.id as string);

  const { data: assigneeRows } = await supabase
    .from("task_assignees")
    .select("task_id, assignee_id")
    .in("task_id", taskIds);

  const assigneeMap = new Map<string, string[]>();
  (assigneeRows ?? []).forEach((row: Record<string, unknown>) => {
    const taskId = row.task_id as string;
    const assigneeId = row.assignee_id as string;
    const ids = assigneeMap.get(taskId) ?? [];
    ids.push(assigneeId);
    assigneeMap.set(taskId, ids);
  });

  return (taskRows as unknown as Record<string, unknown>[] | null ?? []).map((row) =>
    mapTask(row as never, assigneeMap.get(row.id as string) ?? []),
  );
}

export async function createTask(payload: CreateTaskPayload): Promise<Task> {
  const { data: taskRow, error } = await supabase
    .from("tasks")
    .insert({
      workspace_id: payload.workspaceId,
      project_id: payload.projectId ?? null,
      title: payload.title,
      description: payload.description ?? null,
      quadrant: payload.quadrant,
      kind: payload.kind ?? "task",
      due_date: payload.dueDate ?? null,
      start_at: payload.startAt ?? null,
      end_at: payload.endAt ?? null,
      location: payload.location ?? null,
      meeting_link: payload.meetingLink ?? null,
      requires_approval: payload.requiresApproval ?? false,
      created_by: payload.createdBy,
    })
    .select(TASK_COLUMNS)
    .single();

  if (error) throw error;

  const taskRecord = taskRow as unknown as Record<string, unknown>;

  if (payload.assigneeIds && payload.assigneeIds.length > 0) {
    const inserts = payload.assigneeIds.map((assigneeId, i) => ({
      task_id: taskRecord.id as string,
      assignee_id: assigneeId,
      is_primary: i === 0,
    }));

    const { error: assigneeError } = await supabase
      .from("task_assignees")
      .insert(inserts);

    if (assigneeError) throw assigneeError;
  }

  return mapTask(taskRecord as never, payload.assigneeIds ?? []);
}

export async function updateTask(
  taskId: string,
  payload: UpdateTaskPayload,
): Promise<Task> {
  const updateData: Record<string, unknown> = {};
  if (payload.title !== undefined) updateData.title = payload.title;
  if (payload.description !== undefined) updateData.description = payload.description;
  if (payload.quadrant !== undefined) updateData.quadrant = payload.quadrant;
  if (payload.kind !== undefined) updateData.kind = payload.kind;
  if (payload.dueDate !== undefined) updateData.due_date = payload.dueDate;
  if (payload.startAt !== undefined) updateData.start_at = payload.startAt;
  if (payload.endAt !== undefined) updateData.end_at = payload.endAt;
  if (payload.location !== undefined) updateData.location = payload.location;
  if (payload.meetingLink !== undefined) updateData.meeting_link = payload.meetingLink;
  if (payload.completed !== undefined) updateData.completed = payload.completed;
  if (payload.requiresApproval !== undefined) updateData.requires_approval = payload.requiresApproval;
  if (payload.projectId !== undefined) updateData.project_id = payload.projectId;

  const { data: taskRow, error } = await supabase
    .from("tasks")
    .update(updateData)
    .eq("id", taskId)
    .select(TASK_COLUMNS)
    .single();

  if (error) throw error;

  /* If assigneeIds provided, replace task_assignees */
  if (payload.assigneeIds !== undefined) {
    const { error: delErr } = await supabase
      .from("task_assignees")
      .delete()
      .eq("task_id", taskId);
    if (delErr) throw delErr;

    if (payload.assigneeIds.length > 0) {
      const inserts = payload.assigneeIds.map((assigneeId, i) => ({
        task_id: taskId,
        assignee_id: assigneeId,
        is_primary: i === 0,
      }));
      const { error: insErr } = await supabase
        .from("task_assignees")
        .insert(inserts);
      if (insErr) throw insErr;
    }
  }

  const { data: assigneeRows } = await supabase
    .from("task_assignees")
    .select("assignee_id")
    .eq("task_id", taskId);

  return mapTask(
    taskRow as never,
    assigneeRows?.map((r) => r.assignee_id) ?? [],
  );
}

export async function deleteTask(taskId: string): Promise<void> {
  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (error) throw error;
}

export async function archiveTask(taskId: string): Promise<void> {
  const { error } = await supabase
    .from("tasks")
    .update({ is_active: false })
    .eq("id", taskId);
  if (error) throw error;
}

export async function approveTask(taskId: string): Promise<Task> {
  const { data: taskRow, error } = await supabase
    .from("tasks")
    .update({ approved: true, rejected: false })
    .eq("id", taskId)
    .select(TASK_COLUMNS)
    .single();

  if (error) throw error;
  return mapTask(taskRow as never, []);
}

export async function rejectTask(
  taskId: string,
  reason: string,
): Promise<Task> {
  const { data: taskRow, error } = await supabase
    .from("tasks")
    .update({ rejected: true, approved: false, rejection_reason: reason })
    .eq("id", taskId)
    .select(TASK_COLUMNS)
    .single();

  if (error) throw error;
  return mapTask(taskRow as never, []);
}

export async function listMyPendingTasks(): Promise<Task[]> {
  const { data: taskRows, error } = await supabase
    .from("tasks")
    .select(TASK_COLUMNS)
    .eq("requires_approval", true)
    .eq("approved", false)
    .eq("rejected", false)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (taskRows ?? []).map((row) => mapTask(row as never, []));
}
