import { Router, Request, Response } from "express";
import { requireAuth, AuthenticatedRequest } from "../lib/auth-middleware";
import PushSubscription from "../models/push-subscription";
import pushNotificationService from "../lib/push-notification-service";
import connectDB from "../lib/mongodb";

const router = Router();

// GET /api/notifications/vapid-public-key - Get VAPID public key for subscription
router.get("/vapid-public-key", (req: Request, res: Response) => {
  const publicKey = pushNotificationService.getVapidPublicKey();
  
  if (!publicKey) {
    return res.status(503).json({
      error: "Push notifications not configured",
      configured: false,
    });
  }
  
  return res.json({
    publicKey,
    configured: true,
  });
});

// POST /api/notifications/subscribe - Subscribe to push notifications
router.post(
  "/subscribe",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { subscription, userAgent } = req.body;
      const userId = req.user!.id;

      if (!subscription || !subscription.endpoint || !subscription.keys) {
        return res.status(400).json({
          error: "Invalid subscription object",
        });
      }

      await connectDB();

      // Check if subscription already exists
      const existing = await PushSubscription.findOne({
        endpoint: subscription.endpoint,
      });

      if (existing) {
        // Update existing subscription (might be for a different user)
        await PushSubscription.updateOne(
          { endpoint: subscription.endpoint },
          {
            userId,
            keys: subscription.keys,
            userAgent: userAgent || req.headers["user-agent"],
          }
        );

        return res.json({
          success: true,
          message: "Subscription updated",
        });
      }

      // Create new subscription
      await PushSubscription.create({
        userId,
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
        userAgent: userAgent || req.headers["user-agent"],
      });

      return res.status(201).json({
        success: true,
        message: "Subscribed to push notifications",
      });
    } catch (error) {
      console.error("Error subscribing to push notifications:", error);
      return res.status(500).json({
        error: "Failed to subscribe to push notifications",
      });
    }
  }
);

// DELETE /api/notifications/unsubscribe - Unsubscribe from push notifications
router.delete(
  "/unsubscribe",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { endpoint } = req.body;
      const userId = req.user!.id;

      if (!endpoint) {
        return res.status(400).json({
          error: "Endpoint is required",
        });
      }

      await connectDB();

      const result = await PushSubscription.deleteOne({
        userId,
        endpoint,
      });

      if (result.deletedCount === 0) {
        return res.status(404).json({
          error: "Subscription not found",
        });
      }

      return res.json({
        success: true,
        message: "Unsubscribed from push notifications",
      });
    } catch (error) {
      console.error("Error unsubscribing from push notifications:", error);
      return res.status(500).json({
        error: "Failed to unsubscribe from push notifications",
      });
    }
  }
);

// GET /api/notifications/subscriptions - Get user's subscriptions
router.get(
  "/subscriptions",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;

      await connectDB();

      const subscriptions = await PushSubscription.find({ userId }).select(
        "endpoint userAgent createdAt"
      );

      return res.json({
        success: true,
        subscriptions,
        count: subscriptions.length,
      });
    } catch (error) {
      console.error("Error getting subscriptions:", error);
      return res.status(500).json({
        error: "Failed to get subscriptions",
      });
    }
  }
);

// POST /api/notifications/test - Send a test notification (for debugging)
router.post(
  "/test",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;

      const result = await pushNotificationService.sendNotificationToUser(
        userId,
        {
          title: "🔔 Test Notification",
          body: "Push notifications are working! You will receive alerts for order updates.",
          icon: "/logo.png",
          badge: "/logo.png",
          tag: `test-${Date.now()}`,
          data: {
            type: "test",
            timestamp: Date.now(),
          },
        }
      );

      const sentCount = result.success;
      const failedCount = result.failed;

      return res.json({
        success: true,
        message: `Sent to ${sentCount} device(s), ${failedCount} failed`,
        sent: sentCount,
        failed: failedCount,
      });
    } catch (error) {
      console.error("Error sending test notification:", error);
      return res.status(500).json({
        error: "Failed to send test notification",
      });
    }
  }
);

export default router;
