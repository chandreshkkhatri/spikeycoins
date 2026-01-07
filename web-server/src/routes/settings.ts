import { Router, Response } from "express";
import connectDB from "../lib/mongodb";
import UserSettings from "../models/user-settings";
import { requireAuth, AuthenticatedRequest } from "../lib/auth-middleware";

const router: Router = Router();

// GET /api/settings - Get current user's settings
router.get(
  "/",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await connectDB();

      const settings = await UserSettings.getOrCreate(req.user!.id);

      return res.json({
        success: true,
        settings: {
          theme: settings.theme,
          chartSettings: settings.chartSettings,
          watchlistSettings: settings.watchlistSettings,
          tradingDefaults: settings.tradingDefaults,
        },
      });
    } catch (error) {
      console.error("Error getting user settings:", error);
      return res.status(500).json({
        error: "Failed to get settings",
      });
    }
  },
);

// PATCH /api/settings - Update user's settings (partial update)
router.patch(
  "/",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { theme, chartSettings, watchlistSettings, tradingDefaults } =
        req.body;

      await connectDB();

      const settings = await UserSettings.getOrCreate(req.user!.id);

      // Update only provided fields
      if (theme !== undefined) {
        if (!["light", "dark", "system"].includes(theme)) {
          return res.status(400).json({
            error: "Invalid theme value. Must be 'light', 'dark', or 'system'",
          });
        }
        settings.theme = theme;
      }

      if (chartSettings !== undefined) {
        settings.chartSettings = {
          ...settings.chartSettings,
          ...chartSettings,
        };
      }

      if (watchlistSettings !== undefined) {
        settings.watchlistSettings = {
          ...settings.watchlistSettings,
          ...watchlistSettings,
        };
      }

      if (tradingDefaults !== undefined) {
        settings.tradingDefaults = {
          ...settings.tradingDefaults,
          ...tradingDefaults,
        };
      }

      await settings.save();

      return res.json({
        success: true,
        settings: {
          theme: settings.theme,
          chartSettings: settings.chartSettings,
          watchlistSettings: settings.watchlistSettings,
          tradingDefaults: settings.tradingDefaults,
        },
      });
    } catch (error) {
      console.error("Error updating user settings:", error);
      return res.status(500).json({
        error: "Failed to update settings",
      });
    }
  },
);

// PUT /api/settings - Replace user's settings (full update)
router.put(
  "/",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { theme, chartSettings, watchlistSettings, tradingDefaults } =
        req.body;

      await connectDB();

      const settings = await UserSettings.getOrCreate(req.user!.id);

      // Validate theme
      if (theme && !["light", "dark", "system"].includes(theme)) {
        return res.status(400).json({
          error: "Invalid theme value. Must be 'light', 'dark', or 'system'",
        });
      }

      // Replace all settings
      settings.theme = theme || "system";
      settings.chartSettings = chartSettings || {};
      settings.watchlistSettings = watchlistSettings || {};
      settings.tradingDefaults = tradingDefaults || {};

      await settings.save();

      return res.json({
        success: true,
        settings: {
          theme: settings.theme,
          chartSettings: settings.chartSettings,
          watchlistSettings: settings.watchlistSettings,
          tradingDefaults: settings.tradingDefaults,
        },
      });
    } catch (error) {
      console.error("Error replacing user settings:", error);
      return res.status(500).json({
        error: "Failed to update settings",
      });
    }
  },
);

export default router;
