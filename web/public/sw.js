/*
 * Self-destructing service worker.
 *
 * This domain used to serve a different, offline-first PWA that registered a
 * service worker at /sw.js and cached its whole app on visitors' devices.
 * shiplog is not a PWA, but the browser still checks /sw.js for updates on
 * navigation — so serving this file replaces that stale worker with one that
 * clears every cache and unregisters itself, then reloads open tabs. After one
 * visit, the old app is gone and shiplog loads fresh.
 */
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch {
        /* ignore */
      }
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: "window" });
      for (const client of clients) {
        try {
          client.navigate(client.url);
        } catch {
          /* ignore */
        }
      }
    })(),
  );
});
