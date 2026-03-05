"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    // Check initial state (only in browser)
    setOffline(!navigator.onLine);

    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);

    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);

    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 bg-yellow-600 px-4 py-1.5 text-xs font-medium text-white shadow-md sm:text-sm">
      <WifiOff className="h-3.5 w-3.5 shrink-0" />
      <span>You&apos;re offline — showing cached content</span>
    </div>
  );
}
