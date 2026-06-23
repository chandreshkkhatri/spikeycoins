import { Router, Request, Response } from "express";
import { UpstoxService } from "../lib/upstox-service";
import { BinanceService } from "../lib/binance-service";
import connectDB from "../lib/mongodb";
import Account from "../models/account";
import User from "../models/user";
import UserSettings from "../models/user-settings";
import RefreshToken, {
  REFRESH_TOKEN_GRACE_PERIOD_MS,
} from "../models/refresh-token";
import Invite from "../models/invite";
import {
  generateToken,
  generateRefreshToken,
  verifyToken,
  requireAuth,
  getRefreshTokenExpiry,
  AuthenticatedRequest,
} from "../lib/auth-middleware";

const router: Router = Router();

// Google OAuth configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI ||
  "http://localhost:8000/api/auth/google/callback";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// Allowed redirect origins for OAuth (prevents open redirect vulnerability)
const ALLOWED_REDIRECT_ORIGINS = (
  process.env.ALLOWED_ORIGINS ||
  "http://localhost:3000,http://localhost:5173,http://localhost:8000"
)
  .split(",")
  .map((origin) => origin.trim());

// Validate if a redirect URL is allowed
function isValidRedirectUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_REDIRECT_ORIGINS.some((origin) => {
      const allowedOrigin = new URL(origin);
      return (
        parsed.protocol === allowedOrigin.protocol &&
        parsed.host === allowedOrigin.host
      );
    });
  } catch {
    return false;
  }
}

// ============================================================================
// USER AUTHENTICATION
// ============================================================================

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

    // Generate tokens
    const accessToken = generateToken(user._id.toString(), user.email);
    const refreshToken = generateRefreshToken();

    // Save refresh token
    await RefreshToken.create({
      userId: user._id,
      token: refreshToken,
      expiresAt: getRefreshTokenExpiry(),
    });

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

    // Generate tokens
    const accessToken = generateToken(user._id.toString(), user.email);
    const refreshToken = generateRefreshToken();

    // Save refresh token
    await RefreshToken.create({
      userId: user._id,
      token: refreshToken,
      expiresAt: getRefreshTokenExpiry(),
    });

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

// ============================================================================
// GOOGLE OAUTH
// ============================================================================

// GET /api/auth/google - Initiate Google OAuth
router.get("/google", (req: Request, res: Response) => {
  if (!GOOGLE_CLIENT_ID) {
    return res.status(500).json({
      error: "Google OAuth is not configured",
    });
  }

  // Accept optional invite code and redirect URL to pass through OAuth flow
  const inviteCode = req.query.invite as string | undefined;
  const clientRedirect = req.query.redirect as string | undefined;

  // Validate redirect URL if provided, otherwise use default
  const validatedRedirect =
    clientRedirect && isValidRedirectUrl(clientRedirect)
      ? clientRedirect
      : FRONTEND_URL;

  // Encode invite code and redirect in state parameter (will be returned in callback)
  const stateData: { invite?: string; redirect: string } = {
    redirect: validatedRedirect,
  };
  if (inviteCode) {
    stateData.invite = inviteCode;
  }
  const state = Buffer.from(JSON.stringify(stateData)).toString("base64");

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "consent",
    state,
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  return res.redirect(authUrl);
});

// GET /api/auth/google/callback - Handle Google OAuth callback
router.get("/google/callback", async (req: Request, res: Response) => {
  // Parse state to get redirect URL early (needed for error redirects)
  let clientRedirectUrl = FRONTEND_URL;
  let inviteCodeFromState: string | null = null;

  const { state } = req.query;
  if (state && typeof state === "string") {
    try {
      const stateData = JSON.parse(Buffer.from(state, "base64").toString());
      inviteCodeFromState = stateData.invite || null;
      // Validate redirect URL from state
      if (stateData.redirect && isValidRedirectUrl(stateData.redirect)) {
        clientRedirectUrl = stateData.redirect;
      }
    } catch {
      // Invalid state, use defaults
    }
  }

  try {
    const { code, error: oauthError } = req.query;

    if (oauthError) {
      return res.redirect(`${clientRedirectUrl}/login?error=google_auth_cancelled`);
    }

    if (!code) {
      return res.redirect(`${clientRedirectUrl}/login?error=no_authorization_code`);
    }

    // Exchange code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code: code as string,
        grant_type: "authorization_code",
        redirect_uri: GOOGLE_REDIRECT_URI,
      }),
    });

    if (!tokenResponse.ok) {
      console.error(
        "Google token exchange failed:",
        await tokenResponse.text(),
      );
      return res.redirect(`${clientRedirectUrl}/login?error=google_token_failed`);
    }

    const tokens = await tokenResponse.json();

    // Get user info
    const userInfoResponse = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      },
    );

    if (!userInfoResponse.ok) {
      return res.redirect(`${clientRedirectUrl}/login?error=google_userinfo_failed`);
    }

    const googleUser = await userInfoResponse.json();

    await connectDB();

    // Check if user already exists (by googleId or email)
    const existingUser = await User.findOne({
      $or: [
        { googleId: googleUser.id },
        { email: googleUser.email.toLowerCase() },
      ],
    });

    // If user doesn't exist, check bootstrap case or validate invite code
    let validatedInvite = null;
    if (!existingUser) {
      const userCount = await User.countDocuments();
      
      // Allow first user to sign up via Google without invite code
      if (userCount === 0) {
        console.log(`First user bootstrap: Creating account for ${googleUser.email}`);
      } else if (inviteCodeFromState) {
        // Validate the invite code
        const {
          invite,
          valid,
          error: inviteError,
        } = await (Invite as any).findAndValidate(inviteCodeFromState);
        
        if (!valid || !invite) {
          console.log(`Invalid invite code for Google signup: ${inviteCodeFromState} - ${inviteError}`);
          return res.redirect(`${clientRedirectUrl}/login?error=invalid_invite`);
        }
        
        validatedInvite = invite;
        console.log(`Google signup with invite code: ${inviteCodeFromState} for ${googleUser.email}`);
      } else {
        // Not the first user and no invite code provided
        return res.redirect(`${clientRedirectUrl}/login?error=invite_required`);
      }
    }

    // Find or update existing user with Google info
    const user = await (User as any).findOrCreateFromGoogle({
      id: googleUser.id,
      email: googleUser.email,
      name: googleUser.name,
      picture: googleUser.picture,
    });

    // Mark invite as used if this was a new user signup with invite code
    if (validatedInvite && !existingUser) {
      await validatedInvite.useForUser(user._id);
    }

    // Ensure user settings exist
    await (UserSettings as any).getOrCreate(user._id.toString());

    // Generate tokens
    const accessToken = generateToken(user._id.toString(), user.email);
    const refreshToken = generateRefreshToken();

    // Save refresh token
    await RefreshToken.create({
      userId: user._id,
      token: refreshToken,
      expiresAt: getRefreshTokenExpiry(),
    });

    // Redirect to the originating client with tokens
    const params = new URLSearchParams({
      accessToken,
      refreshToken,
    });

    return res.redirect(`${clientRedirectUrl}/auth/callback?${params.toString()}`);
  } catch (error) {
    console.error("Error in Google callback:", error);
    return res.redirect(`${clientRedirectUrl}/login?error=google_auth_failed`);
  }
});

// ============================================================================
// AUTH STATUS (Updated to check JWT)
// ============================================================================

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

// ============================================================================
// LOGOUT
// ============================================================================

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

// ============================================================================
// UPSTOX AUTHENTICATION
// ============================================================================

// GET /api/auth/upstox/login - Initiate Upstox login (redirect)
router.get("/upstox/login", async (req: Request, res: Response) => {
  try {
    const { accountId } = req.query;

    if (!accountId) {
      return res.status(400).json({ error: "accountId parameter is required" });
    }

    await connectDB();
    const account = await Account.findById(accountId as string);

    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    if (account.accountType !== "upstox") {
      return res
        .status(400)
        .json({ error: "Invalid account type. Expected Upstox account." });
    }

    if (!account.apiKey || !account.apiSecret) {
      return res
        .status(400)
        .json({ error: "API credentials not found for this account" });
    }

    const isSandbox = account.metadata?.sandbox || false;
    const upstoxService = new UpstoxService();
    upstoxService.initializeWithCredentials(
      account.apiKey,
      account.apiSecret,
      isSandbox,
    );
    const loginUrl = upstoxService.getLoginURL();

    res.cookie("upstox_account_id", accountId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 10 * 1000, // 10 minutes
    });

    return res.redirect(loginUrl);
  } catch (error) {
    console.error("Error initiating Upstox login:", error);
    return res.status(500).json({
      error: "Failed to initiate Upstox login",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// POST /api/auth/upstox/login - Get Upstox login URL (JSON response)
router.post("/upstox/login", async (req: Request, res: Response) => {
  try {
    const { accountId } = req.body;

    if (!accountId) {
      return res
        .status(400)
        .json({ error: "accountId is required in request body" });
    }

    await connectDB();
    const account = await Account.findById(accountId);

    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    if (account.accountType !== "upstox") {
      return res
        .status(400)
        .json({ error: "Invalid account type. Expected Upstox account." });
    }

    if (!account.apiKey || !account.apiSecret) {
      return res
        .status(400)
        .json({ error: "API credentials not found for this account" });
    }

    const isSandbox = account.metadata?.sandbox || false;
    const upstoxService = new UpstoxService();
    upstoxService.initializeWithCredentials(
      account.apiKey,
      account.apiSecret,
      isSandbox,
    );
    const loginUrl = upstoxService.getLoginURL();

    res.cookie("upstox_account_id", accountId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 10 * 1000, // 10 minutes
    });

    return res.json({
      success: true,
      loginUrl,
      accountId,
      message: "Login URL generated successfully",
    });
  } catch (error) {
    console.error("Error generating Upstox login URL:", error);
    return res.status(500).json({
      error: "Failed to generate Upstox login URL",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// GET /api/auth/upstox/callback - Handle Upstox OAuth callback
router.get("/upstox/callback", async (req: Request, res: Response) => {
  try {
    const { code } = req.query;

    if (!code) {
      return res.redirect(
        `${FRONTEND_URL}/accounts?error=no_authorization_code`,
      );
    }

    const accountId = req.cookies.upstox_account_id;
    if (!accountId) {
      return res.redirect(`${FRONTEND_URL}/accounts?error=session_expired`);
    }

    await connectDB();
    const account = await Account.findById(accountId);

    if (!account) {
      return res.redirect(`${FRONTEND_URL}/accounts?error=account_not_found`);
    }

    const isSandbox = account.metadata?.sandbox || false;
    const upstoxService = new UpstoxService();
    upstoxService.initializeWithCredentials(
      account.apiKey,
      account.apiSecret,
      isSandbox,
    );
    const sessionData = await upstoxService.generateSession(code as string);

    account.accessToken = sessionData.access_token;
    account.metadata = {
      ...account.metadata,
      loginTime: new Date().toISOString(),
    };

    await account.save();

    res.clearCookie("upstox_account_id");
    return res.redirect(`${FRONTEND_URL}/accounts?success=upstox_connected`);
  } catch (error) {
    console.error("Error in Upstox callback:", error);
    res.clearCookie("upstox_account_id");
    return res.redirect(`${FRONTEND_URL}/accounts?error=upstox_session_failed`);
  }
});

// POST /api/auth/upstox/sandbox-token - Store sandbox access token
router.post("/upstox/sandbox-token", async (req: Request, res: Response) => {
  try {
    const { accountId, accessToken } = req.body;

    if (!accountId) {
      return res.status(400).json({ error: "accountId is required" });
    }

    if (!accessToken) {
      return res.status(400).json({ error: "accessToken is required" });
    }

    await connectDB();
    const account = await Account.findById(accountId);

    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    if (account.accountType !== "upstox") {
      return res.status(400).json({ error: "Invalid account type" });
    }

    if (!account.metadata?.sandbox) {
      return res
        .status(400)
        .json({ error: "Account is not a sandbox account" });
    }

    // Store the sandbox access token
    account.accessToken = accessToken;
    account.metadata = {
      ...account.metadata,
      loginTime: new Date().toISOString(),
    };
    await account.save();

    return res.json({
      success: true,
      message: "Sandbox token saved successfully",
    });
  } catch (error) {
    console.error("Error saving sandbox token:", error);
    return res.status(500).json({
      error: "Failed to save sandbox token",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// ============================================================================
// BINANCE AUTHENTICATION
// ============================================================================

// POST /api/auth/binance/validate - Validate Binance API credentials
router.post("/binance/validate", async (req: Request, res: Response) => {
  try {
    const { accountId } = req.body;

    if (!accountId) {
      return res.status(400).json({ error: "accountId parameter is required" });
    }

    await connectDB();
    const account = await Account.findById(accountId);

    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    if (account.accountType !== "binance") {
      return res
        .status(400)
        .json({ error: "Invalid account type. Expected Binance account." });
    }

    if (!account.apiKey || !account.apiSecret) {
      return res
        .status(400)
        .json({ error: "API credentials not found for this account" });
    }

    const tradingSegment = account.metadata?.tradingSegment || "spot";
    const isTestnet = account.metadata?.testnet || false;

    // Initialize Binance service with credentials
    const binanceService = new BinanceService();
    binanceService.initializeWithCredentials(
      account.apiKey,
      account.apiSecret,
      isTestnet,
    );

    // Test connectivity based on trading segment
    let validationResult;
    if (tradingSegment === "usdm") {
      await binanceService.testFuturesConnectivity();
      // Get account info to validate permissions
      validationResult = await binanceService.getFuturesAccount();
    } else {
      await binanceService.testSpotConnectivity();
      // Get account info to validate permissions
      validationResult = await binanceService.getSpotAccount();
    }

    // Update account with validation success (no access token needed for Binance)
    account.lastSyncAt = new Date();
    await account.save();

    return res.json({
      success: true,
      message: `Binance ${tradingSegment.toUpperCase()} credentials validated successfully`,
      canTrade:
        validationResult.canTrade !== undefined
          ? validationResult.canTrade
          : true,
      accountId: account._id,
    });
  } catch (error: any) {
    console.error("Error validating Binance credentials:", error);
    return res.status(401).json({
      success: false,
      error: "Invalid Binance API credentials",
      details: error.message,
    });
  }
});

export default router;
