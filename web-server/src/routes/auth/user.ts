import { Router, Request, Response } from "express";
import connectDB from "../../lib/mongodb";
import User from "../../models/user";
import UserSettings from "../../models/user-settings";
import RefreshToken, {
  REFRESH_TOKEN_GRACE_PERIOD_MS,
} from "../../models/refresh-token";
import Invite from "../../models/invite";
import {
  generateToken,
  generateRefreshToken,
  requireAuth,
  getRefreshTokenExpiry,
  AuthenticatedRequest,
  issueSession,
} from "../../lib/auth-middleware";

const router: Router = Router();

// POST /api/auth/register - Register new user with email/password
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { email, password, name, inviteCode } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({
        error: "Email, password, and name are required",
      });
    }

    if (!inviteCode) {
      return res.status(400).json({
        error: "Invite code is required. Registration is invite-only.",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: "Password must be at least 8 characters long",
      });
    }

    await connectDB();

    // Validate invite code
    const {
      invite,
      valid,
      error: inviteError,
    } = await (Invite as any).findAndValidate(inviteCode);
    if (!valid || !invite) {
      return res.status(400).json({
        error: inviteError || "Invalid invite code",
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({
        error: "An account with this email already exists",
      });
    }

    // Create user
    const user = new User({
      email: email.toLowerCase(),
      name,
    });
    user.setPassword(password);
    await user.save();

    // Mark invite as used
    await invite.useForUser(user._id);

    // Create default settings
    await UserSettings.create({
      userId: user._id,
      theme: "system",
      chartSettings: {},
      watchlistSettings: {},
      tradingDefaults: {},
    });

    // Generate tokens and session
    const { accessToken, refreshToken } = await issueSession(user);

    return res.status(201).json({
      success: true,
      user: user.toJSON(),
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error("Error registering user:", error);
    return res.status(500).json({
      error: "Failed to register user",
    });
  }
});

// POST /api/auth/login - Login with email/password
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password are required",
      });
    }

    await connectDB();

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({
        error: "Invalid email or password",
      });
    }

    if (!user.validatePassword(password)) {
      return res.status(401).json({
        error: "Invalid email or password",
      });
    }

    // Generate tokens and session
    const { accessToken, refreshToken } = await issueSession(user);

    // Cleanup old tokens
    await (RefreshToken as any).cleanupOldTokens(user._id.toString());

    return res.json({
      success: true,
      user: user.toJSON(),
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error("Error logging in:", error);
    return res.status(500).json({
      error: "Failed to login",
    });
  }
});

// POST /api/auth/refresh - Refresh access token
router.post("/refresh", async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        error: "Refresh token is required",
      });
    }

    await connectDB();

    // Find and validate refresh token
    const tokenDoc = await RefreshToken.findOne({ token: refreshToken });
    if (!tokenDoc) {
      return res.status(401).json({
        error: "Invalid refresh token",
      });
    }

    // Check if token is expired
    if (tokenDoc.expiresAt < new Date()) {
      await RefreshToken.deleteOne({ _id: tokenDoc._id });
      return res.status(401).json({
        error: "Refresh token expired",
      });
    }

    // Check if this token was already replaced (used)
    if (tokenDoc.replacedAt) {
      // Check if we're still within the grace period
      const gracePeriodEnd = new Date(
        tokenDoc.replacedAt.getTime() + REFRESH_TOKEN_GRACE_PERIOD_MS,
      );

      if (new Date() > gracePeriodEnd) {
        // Grace period expired - this is suspicious, possibly token reuse attack
        // Delete the entire token family for this user for security
        console.warn(
          `Refresh token reuse detected for user ${tokenDoc.userId} after grace period`,
        );
        return res.status(401).json({
          error: "Refresh token already used",
        });
      }

      // Within grace period - return the replacement token's credentials
      // Find the new token that replaced this one
      const newTokenDoc = await RefreshToken.findOne({
        token: tokenDoc.replacedByToken,
      });
      if (newTokenDoc) {
        // Get user to generate a new access token
        const user = await User.findById(tokenDoc.userId);
        if (!user) {
          return res.status(401).json({
            error: "User not found",
          });
        }

        // Return the existing replacement token with a fresh access token
        return res.json({
          success: true,
          accessToken: generateToken(user._id.toString(), user.email),
          refreshToken: newTokenDoc.token,
        });
      }

      // Replacement token not found (shouldn't happen, but handle gracefully)
      return res.status(401).json({
        error: "Refresh token already used",
      });
    }

    // Get user
    const user = await User.findById(tokenDoc.userId);
    if (!user) {
      await RefreshToken.deleteOne({ _id: tokenDoc._id });
      return res.status(401).json({
        error: "User not found",
      });
    }

    // Generate new tokens
    const newAccessToken = generateToken(user._id.toString(), user.email);
    const newRefreshToken = generateRefreshToken();

    // Mark the old token as replaced (instead of deleting immediately)
    // This allows other requests using the same token within the grace period to still work
    await RefreshToken.updateOne(
      { _id: tokenDoc._id },
      {
        replacedAt: new Date(),
        replacedByToken: newRefreshToken,
      },
    );

    // Create the new refresh token
    await RefreshToken.create({
      userId: user._id,
      token: newRefreshToken,
      expiresAt: getRefreshTokenExpiry(),
    });

    return res.json({
      success: true,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    console.error("Error refreshing token:", error);
    return res.status(500).json({
      error: "Failed to refresh token",
    });
  }
});

// GET /api/auth/me - Get current user
router.get(
  "/me",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await connectDB();

      const user = await User.findById(req.user!.id);
      if (!user) {
        return res.status(404).json({
          error: "User not found",
        });
      }

      return res.json({
        success: true,
        user: user.toJSON(),
      });
    } catch (error) {
      console.error("Error getting user:", error);
      return res.status(500).json({
        error: "Failed to get user",
      });
    }
  },
);

export default router;
