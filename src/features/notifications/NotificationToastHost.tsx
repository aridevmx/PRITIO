import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/Toast";

let channelKeyCounter = 0;

export function NotificationToastHost() {
  const { toast } = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled || !user) return;

      channelKeyCounter++;
      channel = supabase
        .channel(`notification-toasts-${user.id}-${channelKeyCounter}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            const row = payload.new as Record<string, unknown>;
            const delivery = row.delivery as string | undefined;
            if (delivery === "toast" || delivery === "both") {
              const body = row.body as string | undefined;
              const title = row.title as string | undefined;
              toastRef.current.info(body || title || "");
            }
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, []);

  return null;
}
