import { Router, Request, Response } from "express";
import connectDB from "../../lib/mongodb";
import User from "../../models/user";
import RefreshToken from "../../models/refresh-token";
import { verifyToken } from "../../lib/auth-middleware";

const router: Router = Router();

// GET /api/auth/status - Check authentication status
router.get("/status", async (req: Request, res: Response) => {
  try {
    // Check for JWT token
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const payload = verifyToken(token);

      if (payload) {
        await connectDB();
        const user = await User.findById(payload.userId);
        if (user) {
          return res.json({
            isLoggedIn: true,
            user: user.toJSON(),
            allowOfflineAccess: true,
          });
        }
      }
    }

    return res.json({
      isLoggedIn: false,
      allowOfflineAccess: true,
      login_url: null,
      message:
        "Offline mode available. Authenticate individual accounts as needed.",
    });
  } catch (error) {
    console.error("Error checking auth status:", error);
    return res.json({
      isLoggedIn: false,
      allowOfflineAccess: true,
      login_url: null,
      error: "Failed to check auth status, allowing offline access",
    });
  }
});

// GET /api/auth/logout - Handle logout
router.get("/logout", async (req: Request, res: Response) => {
  try {
    // Clear any session cookies if they exist
    res.clearCookie("upstox_account_id");

    return res.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Error during logout:", error);
    return res.status(500).json({
      success: false,
      error: "Logout failed",
    });
  }
});

// POST /api/auth/logout - Handle logout with token invalidation
router.post("/logout", async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    // Clear session cookies
    res.clearCookie("upstox_account_id");

    // Invalidate refresh token if provided
    if (refreshToken) {
      await connectDB();
      await RefreshToken.deleteOne({ token: refreshToken });
    }

    return res.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Error during logout:", error);
    return res.status(500).json({
      success: false,
      error: "Logout failed",
    });
  }
});

export default router;
