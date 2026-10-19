// Learnitt PWA Shell & Data Service Worker
// PRD Section 10 & Phase L6

const SHELL_CACHE_NAME = "learnitt-shell-v2";
const DATA_CACHE_NAME = "learnitt-data-v1";

const SHELL_ASSETS = [
  "/login",
  "/today",
  "/plan",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== SHELL_CACHE_NAME && name !== DATA_CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Never intercept non-GET requests or auth mutations
  if (request.method !== "GET" || url.pathname.startsWith("/auth/")) {
    return;
  }

  // Today route data & viewer assets cache (Network-first with cache fallback)
  if (
    url.pathname === "/api/v1/today" ||
    url.pathname.startsWith("/api/v1/materials") ||
    url.pathname.startsWith("/materials")
  ) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(DATA_CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(DATA_CACHE_NAME);
          const cached = await cache.match(request);
          if (cached) return cached;
          return Response.error();
        })
    );
    return;
  }

  // Network-first for shell navigations, falling back to cached shell
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(SHELL_CACHE_NAME);
        const cached = await cache.match("/today");
        return cached || (await cache.match("/login")) || Response.error();
      })
    );
    return;
  }

  // Cache-first for precached static assets
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      return (
        cachedResponse ||
        fetch(request).then((networkResponse) => {
          return networkResponse;
        })
      );
    })
  );
});
