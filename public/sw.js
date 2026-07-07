// Minimal service worker: makes the app installable (a fetch handler is part of
// the install criteria) without aggressive caching that could serve stale UI.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("fetch", () => {
  // Pass through to the network (no respondWith = default browser handling).
});
