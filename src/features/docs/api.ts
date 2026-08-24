import { supabase } from "@/lib/supabase";

export interface Doc {
  id: string;
  workspaceId: string;
  title: string;
  content: string | null;
  parentFolderId: string | null;
  visibility: "workspace" | "restricted";
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocRef {
  id: string;
  title: string;
}

export interface DocFolder {
  id: string;
  workspaceId: string;
  parentId: string | null;
  name: string;
  position: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

function mapDoc(row: Record<string, unknown>): Doc {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    title: (row.title as string) || "",
    content: (row.content as string) ?? null,
    parentFolderId: (row.parent_folder_id as string | null) ?? null,
    visibility: (row.visibility as Doc["visibility"]) || "workspace",
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapFolder(row: Record<string, unknown>): DocFolder {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    parentId: (row.parent_id as string | null) ?? null,
    name: (row.name as string) || "",
    position: Number(row.position ?? 0),
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

const DOC_COLUMNS =
  "id, workspace_id, title, content, parent_folder_id, visibility, created_by, created_at, updated_at";

const FOLDER_COLUMNS =
  "id, workspace_id, parent_id, name, position, created_by, created_at, updated_at";

// ─── Documentos ────────────────────────────────────────────

export async function listDocs(workspaceId: string): Promise<Doc[]> {
  const { data, error } = await supabase
    .from("docs")
    .select(DOC_COLUMNS)
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapDoc);
}

export async function createDoc(
  workspaceId: string,
  createdBy: string,
  title = "",
  parentFolderId: string | null = null,
): Promise<Doc> {
  const { data, error } = await supabase
    .from("docs")
    .insert({ workspace_id: workspaceId, created_by: createdBy, title, parent_folder_id: parentFolderId })
    .select(DOC_COLUMNS)
    .single();

  if (error) throw error;
  return mapDoc(data as unknown as Record<string, unknown>);
}

export async function updateDoc(
  docId: string,
  payload: {
    title?: string;
    content?: string | null;
    parentFolderId?: string | null;
    visibility?: Doc["visibility"];
  },
): Promise<void> {
  const updateData: Record<string, unknown> = {};
  if (payload.title !== undefined) updateData.title = payload.title;
  if (payload.content !== undefined) updateData.content = payload.content;
  if (payload.parentFolderId !== undefined) updateData.parent_folder_id = payload.parentFolderId;
  if (payload.visibility !== undefined) updateData.visibility = payload.visibility;
  if (Object.keys(updateData).length === 0) return;

  const { error } = await supabase.from("docs").update(updateData).eq("id", docId);
  if (error) throw error;
}

export async function deleteDoc(docId: string): Promise<void> {
  const { error } = await supabase.from("docs").delete().eq("id", docId);
  if (error) throw error;
}

// ─── Relación doc ↔ tarea ─────────────────────────────────

export async function linkDocToTask(docId: string, taskId: string, workspaceId: string): Promise<void> {
  const { error } = await supabase
    .from("doc_task_links")
    .upsert({ doc_id: docId, task_id: taskId, workspace_id: workspaceId }, { ignoreDuplicates: true });
  if (error) throw error;
}

export async function unlinkDocFromTask(docId: string, taskId: string): Promise<void> {
  const { error } = await supabase
    .from("doc_task_links")
    .delete()
    .eq("doc_id", docId)
    .eq("task_id", taskId);
  if (error) throw error;
}

/** Documentos vinculados a una tarea (ligero: id + título). */
export async function listDocsForTask(taskId: string): Promise<DocRef[]> {
  const { data, error } = await supabase
    .from("doc_task_links")
    .select("doc:docs(id, title)")
    .eq("task_id", taskId);

  if (error) return [];
  return ((data ?? []) as unknown as { doc: { id: string; title: string } | null }[])
    .map((r) => ({ id: r.doc?.id ?? "", title: r.doc?.title ?? "" }))
    .filter((d) => d.id);
}

/** IDs de tareas vinculadas a un documento. */
export async function listTaskIdsForDoc(docId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("doc_task_links")
    .select("task_id")
    .eq("doc_id", docId);

  if (error) return [];
  return ((data ?? []) as { task_id: string }[]).map((r) => r.task_id);
}

// ─── Carpetas ──────────────────────────────────────────────

export async function listFolders(workspaceId: string): Promise<DocFolder[]> {
  const { data, error } = await supabase
    .from("doc_folders")
    .select(FOLDER_COLUMNS)
    .eq("workspace_id", workspaceId)
    .order("position", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapFolder);
}

export async function createFolder(
  workspaceId: string,
  createdBy: string,
  name: string,
  parentId: string | null = null,
): Promise<DocFolder> {
  const { data, error } = await supabase
    .from("doc_folders")
    .insert({ workspace_id: workspaceId, created_by: createdBy, name, parent_id: parentId })
    .select(FOLDER_COLUMNS)
    .single();

  if (error) throw error;
  return mapFolder(data as unknown as Record<string, unknown>);
}

export async function renameFolder(folderId: string, name: string): Promise<void> {
  const { error } = await supabase.from("doc_folders").update({ name }).eq("id", folderId);
  if (error) throw error;
}

export async function moveFolder(folderId: string, parentId: string | null): Promise<void> {
  const { error } = await supabase.from("doc_folders").update({ parent_id: parentId }).eq("id", folderId);
  if (error) throw error;
}

/** Elimina la carpeta; sus subcarpetas se pierden (CASCADE) y las notas pasan a la raíz. */
export async function deleteFolder(folderId: string): Promise<void> {
  const { error } = await supabase.from("doc_folders").delete().eq("id", folderId);
  if (error) throw error;
}

// ─── Etiquetas ─────────────────────────────────────────────

export interface DocTag {
  id: string;
  workspaceId: string;
  name: string;
  color: string;
  createdBy: string;
  createdAt: string;
}

const TAG_COLUMNS = "id, workspace_id, name, color, created_by, created_at";

function mapTag(row: Record<string, unknown>): DocTag {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    name: (row.name as string) || "",
    color: (row.color as string) || "#5BA7D1",
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
  };
}

export async function listTags(workspaceId: string): Promise<DocTag[]> {
  const { data, error } = await supabase
    .from("doc_tags")
    .select(TAG_COLUMNS)
    .eq("workspace_id", workspaceId)
    .order("name", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapTag);
}

export async function createTag(
  workspaceId: string,
  createdBy: string,
  name: string,
  color = "#5BA7D1",
): Promise<DocTag> {
  const { data, error } = await supabase
    .from("doc_tags")
    .insert({ workspace_id: workspaceId, created_by: createdBy, name, color })
    .select(TAG_COLUMNS)
    .single();

  if (error) throw error;
  return mapTag(data as unknown as Record<string, unknown>);
}

/** IDs de etiquetas de un documento. */
export async function listTagIdsForDoc(docId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("doc_tag_links")
    .select("tag_id")
    .eq("doc_id", docId);

  if (error) return [];
  return ((data ?? []) as { tag_id: string }[]).map((r) => r.tag_id);
}

export async function linkDocTag(docId: string, tagId: string, workspaceId: string): Promise<void> {
  const { error } = await supabase
    .from("doc_tag_links")
    .upsert({ doc_id: docId, tag_id: tagId, workspace_id: workspaceId }, { ignoreDuplicates: true });
  if (error) throw error;
}

export async function unlinkDocTag(docId: string, tagId: string): Promise<void> {
  const { error } = await supabase
    .from("doc_tag_links")
    .delete()
    .eq("doc_id", docId)
    .eq("tag_id", tagId);
  if (error) throw error;
}

/** Todos los vínculos etiqueta↔documento del workspace (para filtrar/buscar). */
export async function listAllTagLinks(workspaceId: string): Promise<{ docId: string; tagId: string }[]> {
  const { data, error } = await supabase
    .from("doc_tag_links")
    .select("doc_id, tag_id")
    .eq("workspace_id", workspaceId);

  if (error) return [];
  return ((data ?? []) as { doc_id: string; tag_id: string }[]).map((r) => ({
    docId: r.doc_id,
    tagId: r.tag_id,
  }));
}

// ─── Vínculos doc ↔ proyecto ───────────────────────────────

/** IDs de proyectos vinculados a un documento. */
export async function listProjectIdsForDoc(docId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("doc_project_links")
    .select("project_id")
    .eq("doc_id", docId);

  if (error) return [];
  return ((data ?? []) as { project_id: string }[]).map((r) => r.project_id);
}

export async function linkDocToProject(docId: string, projectId: string, workspaceId: string): Promise<void> {
  const { error } = await supabase
    .from("doc_project_links")
    .upsert({ doc_id: docId, project_id: projectId, workspace_id: workspaceId }, { ignoreDuplicates: true });
  if (error) throw error;
}

export async function unlinkDocFromProject(docId: string, projectId: string): Promise<void> {
  const { error } = await supabase
    .from("doc_project_links")
    .delete()
    .eq("doc_id", docId)
    .eq("project_id", projectId);
  if (error) throw error;
}

// ─── Colaboradores ─────────────────────────────────────────

export interface DocCollaborator {
  id: string;
  docId: string;
  workspaceId: string;
  email: string;
  userId: string | null;
  role: "viewer" | "editor";
  invitedBy: string;
  createdAt: string;
}

const COLLAB_COLUMNS = "id, doc_id, workspace_id, email, user_id, role, invited_by, created_at";

function mapCollaborator(row: Record<string, unknown>): DocCollaborator {
  return {
    id: row.id as string,
    docId: row.doc_id as string,
    workspaceId: row.workspace_id as string,
    email: row.email as string,
    userId: (row.user_id as string | null) ?? null,
    role: (row.role as DocCollaborator["role"]) || "viewer",
    invitedBy: row.invited_by as string,
    createdAt: row.created_at as string,
  };
}

export async function listDocCollaborators(docId: string): Promise<DocCollaborator[]> {
  const { data, error } = await supabase
    .from("doc_collaborators")
    .select(COLLAB_COLUMNS)
    .eq("doc_id", docId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapCollaborator);
}

/**
 * Agrega un colaborador. Si sendInvite=true pide a la edge function que
 * inserte el registro y envíe el correo de invitación.
 */
export async function addDocCollaborator(
  docId: string,
  email: string,
  role: DocCollaborator["role"],
  sendInvite = false,
): Promise<DocCollaborator> {
  if (!sendInvite) {
    const { data, error } = await supabase
      .from("doc_collaborators")
      .insert({ doc_id: docId, email: email.toLowerCase(), role })
      .select(COLLAB_COLUMNS)
      .single();
    if (error) throw error;
    return mapCollaborator(data as unknown as Record<string, unknown>);
  }

  // La edge function verifica permisos y manda el email.
  const { data: userData } = await supabase.auth.getUser();
  const { error, data } = await supabase.functions.invoke("invite-doc-collaborator", {
    body: { docId, email: email.toLowerCase(), role, actorUserId: userData.user?.id },
  });
  if (error) throw new Error(typeof error === "object" && "message" in error ? String(error.message) : "Error al invitar");
  return mapCollaborator(
    (data as unknown as { collaborator: Record<string, unknown> }).collaborator ?? (data as unknown as Record<string, unknown>),
  );
}

export async function updateDocCollaboratorRole(
  collaboratorId: string,
  role: DocCollaborator["role"],
): Promise<void> {
  const { error } = await supabase
    .from("doc_collaborators")
    .update({ role })
    .eq("id", collaboratorId);
  if (error) throw error;
}

export async function removeDocCollaborator(collaboratorId: string): Promise<void> {
  const { error } = await supabase.from("doc_collaborators").delete().eq("id", collaboratorId);
  if (error) throw error;
}

// ─── Tipos para el árbol ───────────────────────────────────

export type TreeNode =
  | { kind: "folder"; id: string; name: string; children: TreeNode[] }
  | { kind: "doc"; id: string; title: string };

export function buildDocTree(folders: DocFolder[], docs: Doc[]): TreeNode[] {
  const folderNodes = new Map<string, TreeNode & { kind: "folder" }>();
  for (const f of folders) {
    folderNodes.set(f.id, { kind: "folder", id: f.id, name: f.name, children: [] });
  }

  const roots: TreeNode[] = [];
  // Carpeta huérfana (padre eliminado en cascada) → raíz.
  for (const f of folders) {
    const node = folderNodes.get(f.id)!;
    if (f.parentId && folderNodes.has(f.parentId)) {
      folderNodes.get(f.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  for (const d of docs) {
    const node: TreeNode = { kind: "doc", id: d.id, title: d.title };
    if (d.parentFolderId && folderNodes.has(d.parentFolderId)) {
      folderNodes.get(d.parentFolderId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}
