import { Router, Request, Response } from "express";
import { UpstoxService } from "../../lib/upstox-service";
import connectDB from "../../lib/mongodb";
import Account from "../../models/account";
import { FRONTEND_URL } from "./constants";

const router: Router = Router();

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

export default router;
