// Service Worker for Push Notifications
// This file must be served from the root of the domain

const CACHE_NAME = "openmandi-v1";

// Install event - cache essential resources
self.addEventListener("install", (event) => {
  console.log("[SW] Installing service worker...");
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  console.log("[SW] Activating service worker...");
  event.waitUntil(self.clients.claim());
});

// Push event - handle incoming push notifications
self.addEventListener("push", (event) => {
  console.log("[SW] Push received:", event);

  if (!event.data) {
    console.log("[SW] Push event but no data");
    return;
  }

  let payload;
  try {
    payload = event.data.json();
  } catch (e) {
    console.error("[SW] Failed to parse push data:", e);
    payload = {
      title: "OpenMandi",
      body: event.data.text() || "You have a new notification",
    };
  }

  const options = {
    body: payload.body || "",
    icon: payload.icon || "/logo.png",
    badge: payload.badge || "/logo.png",
    tag: payload.tag || `notification-${Date.now()}`,
    requireInteraction: payload.requireInteraction || false,
    silent: payload.silent || false,
    data: payload.data || {},
    actions: payload.actions || [],
    vibrate: [100, 50, 100], // Vibration pattern for mobile
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || "OpenMandi", options)
  );
});

// Notification click event - handle user clicking on notification
self.addEventListener("notificationclick", (event) => {
  console.log("[SW] Notification click:", event);

  event.notification.close();

  const data = event.notification.data || {};
  let targetUrl = "/";

  // Determine where to navigate based on notification type
  if (data.type) {
    switch (data.type) {
      case "sl_failed":
      case "tp_failed":
      case "sl_tp_failed":
        targetUrl = `/trading?symbol=${data.symbol || ""}`;
        break;
      case "order_placed":
      case "order_filled":
      case "order_failed":
        targetUrl = `/trading?symbol=${data.symbol || ""}`;
        break;
      default:
        targetUrl = "/";
    }
  }

  // Handle action buttons if clicked
  if (event.action) {
    console.log("[SW] Action clicked:", event.action);
    // Handle specific actions here if needed
  }

  // Focus existing window or open new one
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Try to find an existing window to focus
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        // Open a new window if none exists
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});

// Notification close event
self.addEventListener("notificationclose", (event) => {
  console.log("[SW] Notification closed:", event.notification.tag);
});

// Message event - handle messages from the main thread
self.addEventListener("message", (event) => {
  console.log("[SW] Message received:", event.data);

  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
