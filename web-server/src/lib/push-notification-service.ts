import webpush from "web-push";
import PushSubscription from "../models/push-subscription";
import connectDB from "./mongodb";

// VAPID keys for web push
// Generate with: npx web-push generate-vapid-keys
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@openmandi.com";

// Initialize web-push with VAPID keys
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} else {
  console.warn(
    "⚠️ VAPID keys not configured. Push notifications will not work."
  );
  console.warn(
    "   Generate keys with: npx web-push generate-vapid-keys"
  );
}

export interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, unknown>;
  actions?: Array<{
    action: string;
    title: string;
    icon?: string;
  }>;
  requireInteraction?: boolean;
  silent?: boolean;
}

/**
 * Send a push notification to a specific user
 */
export async function sendNotificationToUser(
  userId: string,
  payload: NotificationPayload
): Promise<{ success: number; failed: number }> {
  await connectDB();

  const subscriptions = await PushSubscription.find({ userId });

  if (subscriptions.length === 0) {
    console.log(`No push subscriptions found for user ${userId}`);
    return { success: 0, failed: 0 };
  }

  let success = 0;
  let failed = 0;

  const notificationPayload = JSON.stringify(payload);

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth,
          },
        },
        notificationPayload
      );
      success++;
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      console.error(
        `Failed to send notification to ${subscription.endpoint}:`,
        error instanceof Error ? error.message : error
      );

      // If subscription is invalid (410 Gone or 404), remove it
      if (statusCode === 410 || statusCode === 404) {
        console.log(`Removing invalid subscription: ${subscription.endpoint}`);
        await PushSubscription.deleteOne({ _id: subscription._id });
      }

      failed++;
    }
  }

  console.log(
    `Push notifications sent to user ${userId}: ${success} success, ${failed} failed`
  );

  return { success, failed };
}

/**
 * Send order-related notification
 */
export async function sendOrderNotification(
  userId: string,
  type: "order_placed" | "order_filled" | "order_failed" | "sl_failed" | "tp_failed" | "sl_tp_failed",
  details: {
    symbol: string;
    side?: string;
    quantity?: number;
    price?: number;
    error?: string;
    slError?: string;
    tpError?: string;
  }
): Promise<void> {
  let title: string;
  let body: string;
  let requireInteraction = false;

  switch (type) {
    case "order_placed":
      title = "✅ Order Placed";
      body = `${details.side} ${details.quantity} ${details.symbol} @ ${details.price}`;
      break;
    case "order_filled":
      title = "🎯 Order Filled";
      body = `${details.side} ${details.quantity} ${details.symbol} filled @ ${details.price}`;
      break;
    case "order_failed":
      title = "❌ Order Failed";
      body = `Failed to place ${details.side} order for ${details.symbol}: ${details.error}`;
      requireInteraction = true;
      break;
    case "sl_failed":
      title = "⚠️ Stop Loss Failed";
      body = `Failed to place SL for ${details.symbol}: ${details.slError}`;
      requireInteraction = true;
      break;
    case "tp_failed":
      title = "⚠️ Take Profit Failed";
      body = `Failed to place TP for ${details.symbol}: ${details.tpError}`;
      requireInteraction = true;
      break;
    case "sl_tp_failed":
      title = "🚨 SL & TP Orders Failed";
      body = `${details.symbol}: SL - ${details.slError || "N/A"}, TP - ${details.tpError || "N/A"}`;
      requireInteraction = true;
      break;
    default:
      title = "📊 Order Update";
      body = `Update for ${details.symbol}`;
  }

  await sendNotificationToUser(userId, {
    title,
    body,
    icon: "/logo.png",
    badge: "/logo.png",
    tag: `order-${details.symbol}-${Date.now()}`,
    requireInteraction,
    data: {
      type,
      ...details,
      timestamp: Date.now(),
    },
  });
}

/**
 * Get VAPID public key for client subscription
 */
export function getVapidPublicKey(): string {
  return VAPID_PUBLIC_KEY;
}

/**
 * Check if push notifications are configured
 */
export function isPushConfigured(): boolean {
  return Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
}

export default {
  sendNotificationToUser,
  sendOrderNotification,
  getVapidPublicKey,
  isPushConfigured,
};
