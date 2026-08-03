import { supabase } from "@/lib/supabase";
import { mapProject } from "@/lib/mappers";
import type { Project, ProjectRow } from "@/types";

export async function listProjects(workspaceId: string): Promise<Project[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data as ProjectRow[]).map(mapProject);
}

export async function createProject(
  workspaceId: string,
  name: string,
  color: string,
): Promise<Project> {
  const { data, error } = await supabase
    .from("projects")
    .insert({ workspace_id: workspaceId, name, color })
    .select()
    .single();

  if (error) throw error;
  return mapProject(data as ProjectRow);
}

export async function updateProject(
  id: string,
  data: { name?: string; color?: string },
): Promise<void> {
  const payload: Record<string, string> = {};
  if (data.name !== undefined) payload.name = data.name;
  if (data.color !== undefined) payload.color = data.color;

  const { error } = await supabase
    .from("projects")
    .update(payload)
    .eq("id", id);

  if (error) throw error;
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

export async function getProjectTaskCount(workspaceId: string): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from("tasks")
    .select("project_id")
    .eq("workspace_id", workspaceId)
    .eq("is_active", true);

  if (error) throw error;

  const counts = new Map<string, number>();
  (data ?? []).forEach((row: { project_id: string | null }) => {
    if (row.project_id) {
      counts.set(row.project_id, (counts.get(row.project_id) ?? 0) + 1);
    }
  });
  return counts;
}
