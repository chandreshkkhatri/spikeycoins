import { Router, Request, Response } from "express";
import {
  createAccount,
  getAccountsByUserId,
  getAccountById,
  updateAccount,
  deleteAccount,
} from "../models/account";

const router = Router();

// GET /api/accounts - Get all accounts for a user
router.get("/", async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const accounts = await getAccountsByUserId(userId as string);

    // Remove sensitive data before sending to client
    const safeAccounts = accounts.map((account) => ({
      ...account,
      apiSecret: undefined, // Never send API secret to client
      accessToken: account.accessToken ? "***" : undefined,
    }));

    return res.json({ success: true, accounts: safeAccounts });
  } catch (error) {
    console.error("Error fetching accounts:", error);
    return res.status(500).json({ error: "Failed to fetch accounts" });
  }
});

// POST /api/accounts - Create a new account
router.post("/", async (req: Request, res: Response) => {
  try {
    const { userId, accountType, accountName, apiKey, apiSecret, redirectUri } =
      req.body;

    if (!userId || !accountType || !accountName || !apiKey || !apiSecret) {
      return res.status(400).json({
        error:
          "Missing required fields: userId, accountType, accountName, apiKey, apiSecret",
      });
    }

    if (!["kite", "upstox", "binance"].includes(accountType)) {
      return res.status(400).json({ error: "Invalid account type" });
    }

    // Trim API keys to remove any accidental whitespace
    const accountData: any = {
      userId,
      accountType,
      accountName,
      apiKey: apiKey.trim(),
      apiSecret: apiSecret.trim(),
      isActive: true,
      metadata: {
        ...(redirectUri && { redirectUri }),
      },
    };

    console.log("Creating account with API key length:", apiKey.trim().length);

    // Handle special fields based on account type
    let metadata = {};

    // For Binance, check testnet flag
    if (accountType === "binance" && redirectUri === "testnet") {
      metadata = { testnet: true };
    }

    // For Upstox, check sandbox flag
    if (accountType === "upstox" && redirectUri === "sandbox") {
      metadata = { sandbox: true };
    }

    const finalAccountData = {
      ...accountData,
      metadata,
      redirectUri: undefined, // Don't store redirectUri directly
    };

    const newAccount = await createAccount(finalAccountData);

    // Remove sensitive data before sending response
    const safeAccount = {
      ...newAccount,
      apiSecret: undefined,
    };

    return res.status(201).json({
      success: true,
      account: safeAccount,
      message: "Account created successfully",
    });
  } catch (error: any) {
    console.error("Error creating account:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        error: "Account with this name already exists for this user",
      });
    }

    return res.status(500).json({ error: "Failed to create account" });
  }
});

// GET /api/accounts/:id - Get a specific account
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const account = await getAccountById(id);

    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    // Remove sensitive data
    const safeAccount = {
      ...account,
      apiSecret: undefined,
      accessToken: account.accessToken ? "***" : undefined,
    };

    return res.json({ success: true, account: safeAccount });
  } catch (error) {
    console.error("Error fetching account:", error);
    return res.status(500).json({ error: "Failed to fetch account" });
  }
});

// PUT /api/accounts/:id - Update an account
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Don't allow updating certain fields
    delete updates._id;
    delete updates.createdAt;

    const updatedAccount = await updateAccount(id, updates);

    if (!updatedAccount) {
      return res.status(404).json({ error: "Account not found" });
    }

    // Remove sensitive data
    const safeAccount = {
      ...updatedAccount,
      apiSecret: undefined,
    };

    return res.json({
      success: true,
      account: safeAccount,
      message: "Account updated successfully",
    });
  } catch (error) {
    console.error("Error updating account:", error);
    return res.status(500).json({ error: "Failed to update account" });
  }
});

// DELETE /api/accounts/:id - Delete (deactivate) an account
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const success = await deleteAccount(id);

    if (!success) {
      return res.status(404).json({ error: "Account not found" });
    }

    return res.json({
      success: true,
      message: "Account deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting account:", error);
    return res.status(500).json({ error: "Failed to delete account" });
  }
});

export default router;










