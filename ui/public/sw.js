const CACHE_NAME = "spikeycoins-v3";

const STATIC_ASSETS = [
  "/logo.png",
  "/logo_dark.png",
  "/logo.svg",
  "/logo-maskable-192.png",
  "/logo-maskable-512.png",
];

// Install: cache static shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      )
  );
  self.clients.claim();
});

// Fetch handler with strategy per resource type
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET, API, and WebSocket requests
  if (
    request.method !== "GET" ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/socket")
  ) {
    return;
  }

  // ------------------------------------------------------------------
  // 1. Cache-first for immutable Next.js build assets (JS, CSS, fonts)
  //    These have content-hashed filenames so they never change.
  // ------------------------------------------------------------------
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
          })
      )
    );
    return;
  }

  // ------------------------------------------------------------------
  // 2. Cache-first for known static assets (logos, icons, etc.)
  // ------------------------------------------------------------------
  if (STATIC_ASSETS.includes(url.pathname) || /\.(png|jpg|svg|ico|webp|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
          })
      )
    );
    return;
  }

  // ------------------------------------------------------------------
  // 3. Network-first (stale-while-offline) for HTML page navigations
  //    and Next.js data/RSC requests.
  //    When online: always fetch fresh, cache the response.
  //    When offline: serve the cached version so the app shell loads.
  // ------------------------------------------------------------------
  if (
    request.mode === "navigate" ||
    url.pathname.startsWith("/_next/data/") ||
    request.headers.get("accept")?.includes("text/html")
  ) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          // Offline — serve cached page if available
          return caches.match(request).then((cached) => {
            if (cached) return cached;
            // Fallback: try the root page (SPA fallback)
            return caches.match("/").then((root) =>
              root || new Response("Offline", { status: 503, statusText: "Service Unavailable", headers: { "Content-Type": "text/html" } })
            );
          });
        })
    );
    return;
  }

  // ------------------------------------------------------------------
  // 4. Default: network-first with cache fallback for everything else
  // ------------------------------------------------------------------
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) =>
          cached || new Response("Offline", { status: 503, statusText: "Service Unavailable" })
        )
      )
  );
});

// Handle push notifications
self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const options = {
      body: data.body || "",
      icon: "/logo.png",
      badge: "/logo-maskable-192.png",
      data: data.data || {},
      vibrate: [100, 50, 100],
    };

    event.waitUntil(
      self.registration.showNotification(data.title || "Spikey Coins", options)
    );
  } catch (e) {
    // Ignore malformed push data
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find((c) => c.url.includes(urlToOpen));
        if (existing) return existing.focus();
        return self.clients.openWindow(urlToOpen);
      })
  );
});
