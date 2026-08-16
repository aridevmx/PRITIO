import { supabase } from "@/lib/supabase";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? "";

export function isPushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window;
}

export function isPushGranted(): boolean {
  return Notification.permission === "granted";
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;

  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

export async function subscribeToPush(
  registration: ServiceWorkerRegistration,
): Promise<PushSubscription | null> {
  if (!VAPID_PUBLIC_KEY) return null;

  try {
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    return subscription;
  } catch {
    return null;
  }
}

export async function saveSubscription(subscription: PushSubscription): Promise<boolean> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return false;

  const subJson = subscription.toJSON();

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.user.id,
      endpoint: subJson.endpoint ?? "",
      p256dh: (subJson.keys as Record<string, string>)?.p256dh ?? "",
      auth: (subJson.keys as Record<string, string>)?.auth ?? "",
      user_agent: navigator.userAgent,
    },
    { onConflict: "user_id, endpoint" },
  );

  return !error;
}

export async function unregisterSubscription(): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      const subJson = subscription.toJSON();
      await supabase
        .from("push_subscriptions")
        .delete()
        .eq("endpoint", subJson.endpoint ?? "");
      await subscription.unsubscribe();
    }
    return true;
  } catch {
    return false;
  }
}

export async function initializePushNotifications(): Promise<boolean> {
  if (!isPushSupported()) return false;

  const granted = isPushGranted();
  if (!granted) return false;

  const registration = await registerServiceWorker();
  if (!registration) return false;

  const existingSub = await registration.pushManager.getSubscription();
  if (existingSub) {
    await saveSubscription(existingSub);
    return true;
  }

  const sub = await subscribeToPush(registration);
  if (!sub) return false;

  return saveSubscription(sub);
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from(rawData.split("").map((c) => c.charCodeAt(0)));
}
