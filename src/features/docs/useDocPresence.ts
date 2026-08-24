import { useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export interface DocPresencePeer {
  key: string;
  userId: string;
  name: string;
  color: string;
}

const PRESENCE_COLORS = [
  "#5ba7d1",
  "#9b7edc",
  "#f27d72",
  "#4fc38a",
  "#e8b64c",
  "#d17ba8",
];

let channelKeyCounter = 0;

/**
 * Presencia en un documento: quién más lo tiene abierto ahora mismo.
 * Usa el canal `doc-presence-${docId}` con track/untrack de Supabase Realtime.
 */
export function useDocPresence(docId: string | null): DocPresencePeer[] {
  const [peers, setPeers] = useState<DocPresencePeer[]>([]);

  useEffect(() => {
    setPeers([]);
    if (!docId) return;

    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled || !user) return;

      let name = user.email?.split("@")[0] ?? "Usuario";
      try {
        const { data: prof } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .single();
        if (prof?.full_name) name = prof.full_name as string;
      } catch {
        // nombre fallback
      }

      // Color estable por usuario (mismo usuario → mismo color entre docs)
      const hash = [...user.id].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
      const color = PRESENCE_COLORS[hash % PRESENCE_COLORS.length];

      channelKeyCounter++;
      channel = supabase
        .channel(`doc-presence-${docId}-${channelKeyCounter}`, {
          config: { presence: { key: user.id } },
        })
        .on("presence", { event: "sync" }, () => {
          if (!channel || cancelled) return;
          const state = channel.presenceState<Record<string, string>>();
          const next: DocPresencePeer[] = [];
          for (const [key, metas] of Object.entries(state)) {
            if (key === user.id) continue; // no mostrar el propio avatar
            const meta = metas[0];
            if (!meta) continue;
            next.push({
              key,
              userId: key,
              name: meta.name ?? "Usuario",
              color: meta.color ?? "#9aa4b2",
            });
          }
          setPeers(next);
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED" && channel) {
            void channel.track({ name, color });
          }
        });
    })();

    return () => {
      cancelled = true;
      if (channel) {
        void channel.untrack();
        void supabase.removeChannel(channel);
      }
    };
  }, [docId]);

  return peers;
}
