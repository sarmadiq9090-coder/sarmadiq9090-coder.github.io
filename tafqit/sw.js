// The tool moved to /instawords/. This worker replaces the old offline worker:
// it unregisters itself and reloads open pages so they follow the redirect.
// (Old "tafket-*" caches are removed by the new worker at /instawords/sw.js.)
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    await self.registration.unregister();
    for (const client of await self.clients.matchAll({ type: "window" })) client.navigate(client.url);
  })());
});
