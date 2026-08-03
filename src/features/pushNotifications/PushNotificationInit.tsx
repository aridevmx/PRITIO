import { useEffect, useState } from "react";
import { isPushSupported, initializePushNotifications } from "@/lib/pushNotifications";

export function PushNotificationInit() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready) return;
    if (!isPushSupported()) return;

    if (Notification.permission === "default") {
      Notification.requestPermission().then((permission) => {
        if (permission === "granted") {
          initializePushNotifications().then(setReady);
        }
      });
    } else if (Notification.permission === "granted") {
      initializePushNotifications().then(setReady);
    }
  }, [ready]);

  return null;
}
