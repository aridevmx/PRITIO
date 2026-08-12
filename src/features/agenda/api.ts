import { supabase } from "@/lib/supabase";
import { mapAgendaEvent } from "@/lib/mappers";
import type { AgendaEvent } from "@/types";

export interface AgendaEventInput {
  title: string;
  startsAt: string;
}

export async function listAgendaEvents(workspaceId: string): Promise<AgendaEvent[]> {
  const { data, error } = await supabase
    .from("family_agenda_events")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("starts_at", { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map(mapAgendaEvent);
}

export async function createAgendaEvent(
  workspaceId: string,
  input: AgendaEventInput,
): Promise<AgendaEvent> {
  const { data, error } = await supabase
    .from("family_agenda_events")
    .insert({
      workspace_id: workspaceId,
      title: input.title.trim(),
      starts_at: input.startsAt,
    })
    .select()
    .single();
  if (error) throw error;
  return mapAgendaEvent(data);
}

export async function deleteAgendaEvent(id: string): Promise<void> {
  const { error } = await supabase.from("family_agenda_events").delete().eq("id", id);
  if (error) throw error;
}
