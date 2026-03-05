"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let interval: ReturnType<typeof setInterval> | undefined;

    navigator.serviceWorker.register("/sw.js").then((reg) => {
      // Check for updates every 30 minutes
      interval = setInterval(() => {
        reg.update().catch(() => {});
      }, 30 * 60 * 1000);
    }).catch((err) => {
      console.warn("[SW] Registration failed:", err);
    });

    // When a new SW takes over, reload to pick up new assets
    let refreshing = false;
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    return () => {
      if (interval) clearInterval(interval);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  return null;
}
