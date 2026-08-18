import { supabase } from "@/lib/supabase";
import { TASK_COLUMNS, mapTask } from "@/lib/mappers";
import type { Task, CreateTaskPayload, UpdateTaskPayload, TaskReminder } from "@/types";

export async function getTask(taskId: string): Promise<Task> {
  const { data: taskRow, error } = await supabase
    .from("tasks")
    .select(TASK_COLUMNS)
    .eq("id", taskId)
    .single();

  if (error) throw error;

  return mapTask(taskRow as never, await fetchAssigneesFor(taskId));
}

export async function listTasks(workspaceId: string): Promise<Task[]> {  const { data: taskRows, error } = await supabase
    .from("tasks")
    .select(TASK_COLUMNS)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const taskIds = (taskRows as unknown as Record<string, unknown>[] | null ?? []).map((r) => r.id as string);

  const assigneeMap = await fetchAssigneesMap(taskIds);

  return (taskRows as unknown as Record<string, unknown>[] | null ?? []).map((row) =>
    mapTask(row as never, assigneeMap.get(row.id as string) ?? []),
  );
}

async function fetchAssigneesMap(taskIds: string[]): Promise<Map<string, string[]>> {
  const assigneeMap = new Map<string, string[]>();
  if (taskIds.length === 0) return assigneeMap;

  const { data: assigneeRows } = await supabase
    .from("task_assignees")
    .select("task_id, assignee_id")
    .in("task_id", taskIds);

  (assigneeRows ?? []).forEach((row: Record<string, unknown>) => {
    const taskId = row.task_id as string;
    const assigneeId = row.assignee_id as string;
    const ids = assigneeMap.get(taskId) ?? [];
    ids.push(assigneeId);
    assigneeMap.set(taskId, ids);
  });

  return assigneeMap;
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
      start_date: payload.startDate ?? null,
      end_date: payload.endDate ?? null,
      visibility: payload.visibility ?? "all",
      due_date: payload.dueDate ?? null,
      start_at: payload.startAt ?? null,
      end_at: payload.endAt ?? null,
      location: payload.location ?? null,
      meeting_link: payload.meetingLink ?? null,
      requires_approval: payload.requiresApproval ?? false,
      recurrence_freq: payload.recurrenceFreq ?? null,
      recurrence_interval: payload.recurrenceInterval ?? 1,
      recurrence_end_date: payload.recurrenceEndDate ?? null,
      recurrence_count: payload.recurrenceCount ?? null,
      approval_requested_at: payload.approvalRequestedAt ?? null,
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
  if (payload.startDate !== undefined) updateData.start_date = payload.startDate;
  if (payload.endDate !== undefined) updateData.end_date = payload.endDate;
  if (payload.visibility !== undefined) updateData.visibility = payload.visibility;
  if (payload.dueDate !== undefined) updateData.due_date = payload.dueDate;
  if (payload.startAt !== undefined) updateData.start_at = payload.startAt;
  if (payload.endAt !== undefined) updateData.end_at = payload.endAt;
  if (payload.location !== undefined) updateData.location = payload.location;
  if (payload.meetingLink !== undefined) updateData.meeting_link = payload.meetingLink;
  if (payload.completed !== undefined) {
    updateData.completed = payload.completed;
    if (payload.completedAt === undefined) {
      updateData.completed_at = payload.completed ? new Date().toISOString() : null;
    }
  }
  if (payload.completedAt !== undefined) {
    updateData.completed_at = payload.completedAt;
    if (payload.completed === undefined) updateData.completed = Boolean(payload.completedAt);
  }
  if (payload.requiresApproval !== undefined) updateData.requires_approval = payload.requiresApproval;
  if (payload.approved !== undefined) updateData.approved = payload.approved;
  if (payload.rejected !== undefined) updateData.rejected = payload.rejected;
  if (payload.rejectionReason !== undefined) updateData.rejection_reason = payload.rejectionReason;
  if (payload.approvalRequestedAt !== undefined) updateData.approval_requested_at = payload.approvalRequestedAt;
  if (payload.projectId !== undefined) updateData.project_id = payload.projectId;
  if (payload.recurrenceFreq !== undefined) updateData.recurrence_freq = payload.recurrenceFreq;
  if (payload.recurrenceInterval !== undefined) updateData.recurrence_interval = payload.recurrenceInterval;
  if (payload.recurrenceEndDate !== undefined) updateData.recurrence_end_date = payload.recurrenceEndDate;
  if (payload.recurrenceCount !== undefined) updateData.recurrence_count = payload.recurrenceCount;

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

async function fetchAssigneesFor(taskId: string): Promise<string[]> {
  const { data: assigneeRows } = await supabase
    .from("task_assignees")
    .select("assignee_id")
    .eq("task_id", taskId);
  return (assigneeRows ?? []).map((r: Record<string, unknown>) => r.assignee_id as string);
}

export async function approveTask(taskId: string): Promise<Task> {
  const { data: taskRow, error } = await supabase
    .from("tasks")
    .update({ approved: true, rejected: false })
    .eq("id", taskId)
    .select(TASK_COLUMNS)
    .single();

  if (error) throw error;
  return mapTask(taskRow as never, await fetchAssigneesFor(taskId));
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
  return mapTask(taskRow as never, await fetchAssigneesFor(taskId));
}

export async function listPendingApprovals(workspaceId: string): Promise<Task[]> {
  const { data: taskRows, error } = await supabase
    .from("tasks")
    .select(TASK_COLUMNS)
    .eq("workspace_id", workspaceId)
    .eq("requires_approval", true)
    .eq("approved", false)
    .eq("rejected", false)
    .eq("completed", false)
    .order("approval_requested_at", { ascending: true, nullsFirst: true });

  if (error) throw error;

  const rows = (taskRows as unknown as Record<string, unknown>[] | null ?? []);
  const taskIds = rows.map((r) => r.id as string);
  const assigneeMap = await fetchAssigneesMap(taskIds);

  return rows.map((row) => mapTask(row as never, assigneeMap.get(row.id as string) ?? []));
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

export async function listTaskReminders(taskId: string): Promise<TaskReminder[]> {
  try {
    const { data, error } = await supabase
      .from("task_reminders")
      .select("id, task_id, remind_at, created_by, notified")
      .eq("task_id", taskId)
      .order("remind_at", { ascending: true });

    if (error) return [];
    return (data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      taskId: r.task_id as string,
      remindAt: r.remind_at as string,
      createdBy: r.created_by as string,
      notified: Boolean(r.notified),
    }));
  } catch {
    return [];
  }
}

export async function saveTaskReminders(
  taskId: string,
  remindAts: string[],
): Promise<void> {
  let user;
  try {
    const res = await supabase.auth.getUser();
    user = res.data.user;
  } catch {
    return;
  }
  if (!user) return;

  const iso = remindAts
    .filter(Boolean)
    .map((v) => {
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d.toISOString();
    })
    .filter((v): v is string => v !== null);

  try {
    const { error } = await supabase
      .from("task_reminders")
      .delete()
      .eq("task_id", taskId)
      .eq("created_by", user.id);
    if (error) return;
  } catch {
    return;
  }

  if (iso.length === 0) return;

  try {
    const { error } = await supabase.from("task_reminders").insert(
      iso.map((remindAt) => ({ task_id: taskId, created_by: user.id, remind_at: remindAt })),
    );
    if (error) return;
  } catch {
    // table may not exist yet — don't block task save
  }
}
