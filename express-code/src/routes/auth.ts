import { Router, Request, Response } from "express";
import kiteConnectService from "../lib/kiteconnect-service";
import upstoxService from "../lib/upstox-service";
import binanceService from "../lib/binance-service";
import connectDB from "../lib/mongodb";
import Account from "../models/account";

const router = Router();

// ============================================================================
// AUTH STATUS
// ============================================================================

// GET /api/auth/status - Check authentication status
router.get("/status", async (req: Request, res: Response) => {
  try {
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
    res.clearCookie("kite_account_id");
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

// ============================================================================
// KITE AUTHENTICATION
// ============================================================================

// GET /api/auth/kite/login - Initiate Kite login (redirect)
router.get("/kite/login", async (req: Request, res: Response) => {
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

    if (account.accountType !== "kite") {
      return res
        .status(400)
        .json({ error: "Invalid account type. Expected Kite account." });
    }

    if (!account.apiKey || !account.apiSecret) {
      return res
        .status(400)
        .json({ error: "API credentials not found for this account" });
    }

    kiteConnectService.initializeWithCredentials(
      account.apiKey,
      account.apiSecret
    );
    const loginUrl = kiteConnectService.getLoginURL();

    // Set cookie to track which account is being authenticated
    res.cookie("kite_account_id", accountId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 10 * 1000, // 10 minutes
    });

    return res.redirect(loginUrl);
  } catch (error) {
    console.error("Error initiating Kite login:", error);
    return res.status(500).json({
      error: "Failed to initiate Kite login",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// POST /api/auth/kite/login - Get Kite login URL (JSON response)
router.post("/kite/login", async (req: Request, res: Response) => {
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

    if (account.accountType !== "kite") {
      return res
        .status(400)
        .json({ error: "Invalid account type. Expected Kite account." });
    }

    if (!account.apiKey || !account.apiSecret) {
      return res
        .status(400)
        .json({ error: "API credentials not found for this account" });
    }

    kiteConnectService.initializeWithCredentials(
      account.apiKey,
      account.apiSecret
    );
    const loginUrl = kiteConnectService.getLoginURL();

    // Set cookie to track which account is being authenticated
    res.cookie("kite_account_id", accountId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 10 * 1000, // 10 minutes
    });

    return res.json({
      success: true,
      loginUrl,
      accountId,
      message:
        "Login URL generated successfully. Redirect user to loginUrl to complete authentication.",
    });
  } catch (error) {
    console.error("Error generating Kite login URL:", error);
    return res.status(500).json({
      error: "Failed to generate Kite login URL",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// GET /api/auth/kite/callback - Handle Kite OAuth callback
router.get("/kite/callback", async (req: Request, res: Response) => {
  try {
    const { request_token, status, action } = req.query;

    // Check if authentication was successful
    if (status !== "success" || action !== "login") {
      return res.redirect(`/accounts?error=kite_auth_failed`);
    }

    if (!request_token) {
      return res.redirect(`/accounts?error=no_request_token`);
    }

    // Get account ID from cookie
    const accountId = req.cookies.kite_account_id;
    if (!accountId) {
      return res.redirect(`/accounts?error=session_expired`);
    }

    await connectDB();
    const account = await Account.findById(accountId);

    if (!account) {
      return res.redirect(`/accounts?error=account_not_found`);
    }

    kiteConnectService.initializeWithCredentials(
      account.apiKey,
      account.apiSecret
    );
    const sessionData = await kiteConnectService.generateSession(
      request_token as string
    );

    account.accessToken = sessionData.access_token;
    account.metadata = {
      ...account.metadata,
      userId: sessionData.user_id,
      userShortname: sessionData.user_shortname,
      publicToken: sessionData.public_token,
      loginTime: new Date().toISOString(),
    };

    await account.save();

    res.clearCookie("kite_account_id");
    return res.redirect(`/accounts?success=kite_connected`);
  } catch (error) {
    console.error("Error in Kite callback:", error);
    res.clearCookie("kite_account_id");
    return res.redirect(`/accounts?error=kite_session_failed`);
  }
});

// GET /api/auth/kite/session - Get Kite session status
router.get("/kite/session", async (req: Request, res: Response) => {
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

    if (account.accountType !== "kite") {
      return res
        .status(400)
        .json({ error: "Invalid account type. Expected Kite account." });
    }

    const hasValidSession = !!account.accessToken;

    return res.json({
      success: true,
      isAuthenticated: hasValidSession,
      accountId: account._id,
      metadata: account.metadata,
    });
  } catch (error) {
    console.error("Error checking Kite session:", error);
    return res.status(500).json({ error: "Failed to check session status" });
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
    upstoxService.initializeWithCredentials(
      account.apiKey,
      account.apiSecret,
      isSandbox
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
    upstoxService.initializeWithCredentials(
      account.apiKey,
      account.apiSecret,
      isSandbox
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
      return res.redirect(`/accounts?error=no_authorization_code`);
    }

    const accountId = req.cookies.upstox_account_id;
    if (!accountId) {
      return res.redirect(`/accounts?error=session_expired`);
    }

    await connectDB();
    const account = await Account.findById(accountId);

    if (!account) {
      return res.redirect(`/accounts?error=account_not_found`);
    }

    const isSandbox = account.metadata?.sandbox || false;
    upstoxService.initializeWithCredentials(
      account.apiKey,
      account.apiSecret,
      isSandbox
    );
    const sessionData = await upstoxService.generateSession(code as string);

    account.accessToken = sessionData.access_token;
    account.metadata = {
      ...account.metadata,
      loginTime: new Date().toISOString(),
    };

    await account.save();

    res.clearCookie("upstox_account_id");
    return res.redirect(`/accounts?success=upstox_connected`);
  } catch (error) {
    console.error("Error in Upstox callback:", error);
    res.clearCookie("upstox_account_id");
    return res.redirect(`/accounts?error=upstox_session_failed`);
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
    binanceService.initializeWithCredentials(
      account.apiKey,
      account.apiSecret,
      isTestnet
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
