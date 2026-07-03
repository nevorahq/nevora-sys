/* Nevora push worker. Background notifications use the browser/OS sound. */
self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let payload = {};
    try {
      payload = event.data ? event.data.json() : {};
    } catch {
      payload = {};
    }
    const title = typeof payload.title === "string" && payload.title.trim()
      ? payload.title.slice(0, 120)
      : "Nevora";
    const body = typeof payload.body === "string"
      ? payload.body.slice(0, 240)
      : "You have a new item in Action Center.";
    const url = safeTarget(payload.url);
    const tag = typeof payload.tag === "string" && payload.tag
      ? payload.tag.slice(0, 200)
      : "nevora-notification";
    await self.registration.showNotification(title, {
      body,
      tag,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      data: { url },
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = safeTarget(event.notification.data && event.notification.data.url);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("focus" in client) {
        await client.focus();
        if ("navigate" in client) await client.navigate(target);
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});

function safeTarget(value) {
  return typeof value === "string" && value.startsWith("/dashboard/") && !value.startsWith("//")
    ? value
    : "/dashboard/actions";
}
