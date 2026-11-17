// Chez Bébé: shows notifications from the other phone, and opens the app when one is tapped.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = { title: "Chez Bébé", body: "", url: "./" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "icon-192.png",
      badge: "icon-192.png",
      tag: data.tag || undefined,
      data: { url: data.url === "vault.html" ? "vault.html" : "./" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "./", self.registration.scope).href;
  const vault = url.endsWith("vault.html");
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      // Bring the right app forward: the Vault for letters, Chez Bébé for everything else
      for (const c of list) if (c.url.includes("vault.html") === vault && "focus" in c) return c.focus();
      return self.clients.openWindow(url);
    }),
  );
});
