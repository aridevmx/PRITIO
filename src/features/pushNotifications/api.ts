import { supabase } from "@/lib/supabase";

export async function sendPushNotification(userId: string, title: string, body: string, url?: string): Promise<boolean> {
  try {
    const { error } = await supabase.functions.invoke("send-push", {
      body: { userId, title, body, url },
    });
    if (error) throw error;
    return true;
  } catch {
    return false;
  }
}
