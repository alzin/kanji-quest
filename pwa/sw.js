// These values are replaced by build/pwa.ts after the offline shell is rendered.
const VERSION = __CACHE_VERSION__;
const PRECACHE_URLS = __PRECACHE_URLS__;
const BASE_PATH = new URL(self.registration.scope).pathname;
// GitHub Pages projects share an origin and Cache Storage. Only retire caches
// belonging to this installation's scope when a newer build activates.
const CACHE_PREFIX = `kanji-dash-precache-${encodeURIComponent(BASE_PATH)}-`;
const CACHE_NAME = `${CACHE_PREFIX}${VERSION}`;
const PRECACHE_PATHS = new Set(PRECACHE_URLS);
const APP_PATHS = new Set(["", "camp", "collection", "map", "practice", "run", "world"]);

self.addEventListener("install", (event) => {
  // Installation succeeds only when the entire game, including lazy route chunks,
  // is available offline. Never activate an update during an existing game session.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(
      PRECACHE_URLS.map((url) => new Request(url, { cache: "reload" })),
    )),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (!url.pathname.startsWith(BASE_PATH)) return;
  const path = url.pathname.slice(BASE_PATH.length).replace(/\/$/, "");
  const isAppNavigation = request.mode === "navigate" && APP_PATHS.has(path);
  if (!isAppNavigation && !PRECACHE_PATHS.has(url.pathname)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Serve a route-independent shell from this build even while online: its
    // scripts and lazy imports must stay in sync until the next worker activates.
    // The browser URL is untouched, so search params such as /run?gate=3 survive.
    const cached = await cache.match(isAppNavigation ? `${BASE_PATH}offline.html` : url.pathname);
    return cached || fetch(request);
  })());
});

// Daily reminders from the API. Browsers require every push to show a notification.
self.addEventListener("push", (event) => {
  let message = {};
  try { message = event.data ? event.data.json() : {}; } catch { /* Fall back to the default text. */ }
  // Valid JSON that is not an object (such as null) must still show a notification.
  if (!message || typeof message !== "object") message = {};
  for (const key of ["title", "body", "tag"]) if (typeof message[key] !== "string") delete message[key];
  event.waitUntil(self.registration.showNotification(message.title || "Your kanji are waiting 🏮", {
    body: message.body || "A few minutes today keeps them fresh.",
    tag: message.tag || "daily-reminder",
    icon: `${BASE_PATH}icons/icon-192.png`,
    lang: "en",
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    // Bring back an open game rather than starting a second one.
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = windows.find((client) => new URL(client.url).pathname.startsWith(BASE_PATH));
    if (open) return open.focus();
    return self.clients.openWindow(BASE_PATH);
  })());
});
