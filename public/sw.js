const APP_URL = self.location.origin;

self.addEventListener("push", (event) => {
  let data: { title?: string; body?: string; url?: string } = {};

  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { title: "Pritio", body: event.data?.text() ?? "" };
  }

  const title = data.title ?? "Pritio";
  const body = data.body ?? "";
  const url = data.url ?? APP_URL;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/favicon.svg",
      badge: "/icons.svg",
      data: { url },
      vibrate: [200, 100, 200],
      requireInteraction: true,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url ?? APP_URL;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find((c) => c.url === url && "focus" in c);
        if (existing) {
          return existing.focus();
        }
        return self.clients.openWindow(url);
      }),
  );
});
