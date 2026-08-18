import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export interface PresenceMember {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  isOnline: boolean;
}

const HEARTBEAT_MS = 60_000;
const POLL_MS = 30_000;

/** Emite un heartbeat de presencia propio y consulta la presencia de los miembros del workspace. */
export function usePresence(
  workspaceId: string | null,
  profileId: string | null,
): PresenceMember[] {
  const [members, setMembers] = useState<PresenceMember[]>([]);
  const heartbeatRef = useRef<number | null>(null);

  useEffect(() => {
    if (!workspaceId || !profileId) return;
    const beat = () => {
      void (async () => {
        try {
          await supabase
            .from("profiles")
            .update({ presence_updated_at: new Date().toISOString() })
            .eq("id", profileId);
        } catch {
          // column may not exist yet
        }
      })();
    };
    beat();
    heartbeatRef.current = window.setInterval(beat, HEARTBEAT_MS);
    return () => {
      if (heartbeatRef.current !== null) {
        window.clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };
  }, [workspaceId, profileId]);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const { data } = await supabase.rpc("list_workspace_member_presence", {
          p_workspace_id: workspaceId,
        });
        if (cancelled) return;
        const rows = (data ?? []) as Record<string, unknown>[];
        setMembers(
          rows.map((r) => ({
            userId: r.user_id as string,
            fullName: (r.full_name as string) ?? "Usuario",
            avatarUrl: (r.avatar_url as string | null) ?? null,
            isOnline: Boolean(r.is_online),
          })),
        );
      } catch {
        // sin presencia: no romper la UI
      }
    };
    void load();
    const t = window.setInterval(() => void load(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [workspaceId]);

  return members;
}
