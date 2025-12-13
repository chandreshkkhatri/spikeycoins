import api from "./api";

// Storage key for notification permission status
const NOTIFICATION_PERMISSION_KEY = "openMandi_notificationPermission";

/**
 * Check if push notifications are supported in this browser
 */
export function isPushSupported(): boolean {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * Get the current notification permission status
 */
export function getNotificationPermission(): NotificationPermission {
  if (!("Notification" in window)) {
    return "denied";
  }
  return Notification.permission;
}

/**
 * Request notification permission from the user
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) {
    console.warn("Notifications not supported in this browser");
    return "denied";
  }

  const permission = await Notification.requestPermission();
  localStorage.setItem(NOTIFICATION_PERMISSION_KEY, permission);
  return permission;
}

/**
 * Register the service worker for push notifications
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) {
    console.warn("Service workers not supported");
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
    });

    console.log("Service worker registered:", registration.scope);

    // Wait for the service worker to be ready
    await navigator.serviceWorker.ready;

    return registration;
  } catch (error) {
    console.error("Service worker registration failed:", error);
    return null;
  }
}

/**
 * Get the VAPID public key from the server
 */
async function getVapidPublicKey(): Promise<string | null> {
  try {
    const response = await api.get("/notifications/vapid-public-key");
    if (response.data.configured && response.data.publicKey) {
      return response.data.publicKey;
    }
    console.warn("Push notifications not configured on server");
    return null;
  } catch (error) {
    console.error("Failed to get VAPID public key:", error);
    return null;
  }
}

/**
 * Convert a base64 string to Uint8Array (for applicationServerKey)
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray as Uint8Array<ArrayBuffer>;
}

/**
 * Subscribe to push notifications
 */
export async function subscribeToPushNotifications(): Promise<boolean> {
  if (!isPushSupported()) {
    console.warn("Push notifications not supported");
    return false;
  }

  // Request permission if not granted
  const permission = await requestNotificationPermission();
  if (permission !== "granted") {
    console.warn("Notification permission denied");
    return false;
  }

  // Get VAPID public key
  const vapidPublicKey = await getVapidPublicKey();
  if (!vapidPublicKey) {
    console.error("Could not get VAPID public key");
    return false;
  }

  // Register service worker
  const registration = await registerServiceWorker();
  if (!registration) {
    console.error("Could not register service worker");
    return false;
  }

  try {
    // Check for existing subscription
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      // Create new subscription
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
    }

    // Send subscription to server
    const response = await api.post("/notifications/subscribe", {
      subscription: {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: btoa(
            String.fromCharCode.apply(
              null,
              Array.from(new Uint8Array(subscription.getKey("p256dh")!))
            )
          ),
          auth: btoa(
            String.fromCharCode.apply(
              null,
              Array.from(new Uint8Array(subscription.getKey("auth")!))
            )
          ),
        },
      },
      userAgent: navigator.userAgent,
    });

    console.log("Push subscription saved:", response.data);
    return true;
  } catch (error) {
    console.error("Failed to subscribe to push notifications:", error);
    return false;
  }
}

/**
 * Unsubscribe from push notifications
 */
export async function unsubscribeFromPushNotifications(): Promise<boolean> {
  if (!isPushSupported()) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      // Unsubscribe locally
      await subscription.unsubscribe();

      // Remove from server
      await api.delete("/notifications/unsubscribe", {
        data: { endpoint: subscription.endpoint },
      });

      console.log("Unsubscribed from push notifications");
    }

    return true;
  } catch (error) {
    console.error("Failed to unsubscribe from push notifications:", error);
    return false;
  }
}

/**
 * Check if user is currently subscribed to push notifications
 */
export async function isSubscribedToPush(): Promise<boolean> {
  if (!isPushSupported()) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription !== null;
  } catch (error) {
    console.error("Failed to check push subscription:", error);
    return false;
  }
}

/**
 * Send a test notification
 */
export async function sendTestNotification(): Promise<boolean> {
  try {
    const response = await api.post("/notifications/test");
    console.log("Test notification sent:", response.data);
    return response.data.success;
  } catch (error) {
    console.error("Failed to send test notification:", error);
    return false;
  }
}

/**
 * Show a local notification (for in-app alerts when the app is in foreground)
 */
export function showLocalNotification(
  title: string,
  options?: NotificationOptions
): void {
  if (getNotificationPermission() !== "granted") {
    console.warn("Notification permission not granted");
    return;
  }

  // Use service worker to show notification if available
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then((registration) => {
      registration.showNotification(title, {
        icon: "/logo.png",
        badge: "/logo.png",
        ...options,
      });
    });
  } else {
    // Fallback to regular Notification API
    new Notification(title, {
      icon: "/logo.png",
      ...options,
    });
  }
}

export default {
  isPushSupported,
  getNotificationPermission,
  requestNotificationPermission,
  registerServiceWorker,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
  isSubscribedToPush,
  sendTestNotification,
  showLocalNotification,
};
