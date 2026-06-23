import { Router, Response } from "express";
import {
  createAccount,
  getAccountsByUserId,
  updateAccount,
  deleteAccount,
} from "../models/account";
import { requireAuth, requireAccountAccess, AuthenticatedRequest } from "../lib/auth-middleware";
import { demoAccountService } from "../lib/demo-account-service";
import { asyncHandler } from "../lib/async-handler";

const router: Router = Router();

// All accounts routes require authentication
router.use(requireAuth);

// GET /api/accounts - Get all accounts for a user
router.get(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    let accounts: any[] = await getAccountsByUserId(userId);

    // Append demo account if enabled
    if (demoAccountService.isDemoAccountEnabled()) {
      const demoAccount = demoAccountService.getDemoAccount(false);
      if (demoAccount) {
        accounts.push(demoAccount);
      }
    }

    // Remove sensitive data before sending to client
    const safeAccounts = accounts.map((account) => ({
      ...account,
      apiSecret: undefined, // Never send API secret to client
      accessToken: account.accessToken ? "***" : undefined,
    }));

    return res.json({ success: true, accounts: safeAccounts });
  })
);

// POST /api/accounts - Create a new account
router.post(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    console.log(
      "[Accounts] Creating account for user:",
      req.user!.id
    );
    // Use userId from authentication only
    const userId = req.user!.id;
    const {
      accountType,
      accountName,
      apiKey,
      apiSecret,
      redirectUri,
      metadata: incomingMetadata = {},
    } = req.body;

    if (!accountType || !accountName || !apiKey || !apiSecret) {
      return res.status(400).json({
        error:
          "Missing required fields: accountType, accountName, apiKey, apiSecret",
      });
    }

    if (!["upstox", "binance"].includes(accountType)) {
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
        ...incomingMetadata,
      },
    };

    // Handle special fields based on account type
    let metadata = {
      ...incomingMetadata,
    };

    // For Binance, check testnet flag
    if (accountType === "binance" && redirectUri === "testnet") {
      metadata.testnet = true;
    }

    // For Upstox, check sandbox flag
    if (accountType === "upstox" && redirectUri === "sandbox") {
      metadata.sandbox = true;
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
  })
);

// GET /api/accounts/:id - Get a specific account
router.get(
  "/:id",
  requireAccountAccess,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const account = req.account!;

    // Remove sensitive data
    const safeAccount = {
      ...account,
      apiSecret: undefined,
      accessToken: account.accessToken ? "***" : undefined,
    };

    return res.json({ success: true, account: safeAccount });
  })
);

// Helper function for updating an account
const handleUpdateAccount = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  if (demoAccountService.isDemoAccountId(id)) {
    return res.status(403).json({ error: "Cannot modify demo account" });
  }

  const updates = req.body;

  // Don't allow updating certain fields
  delete updates._id;
  delete updates.userId; // Secure: Don't allow changing user ownership!
  delete updates.createdAt;

  // Trim API keys if provided
  if (updates.apiKey) {
    updates.apiKey = updates.apiKey.trim();
  }
  if (updates.apiSecret) {
    updates.apiSecret = updates.apiSecret.trim();
  }

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
});

// PUT /api/accounts/:id - Update an account
router.put("/:id", requireAccountAccess, handleUpdateAccount);

// PATCH /api/accounts/:id - Update an account (partial update)
router.patch("/:id", requireAccountAccess, handleUpdateAccount);

// DELETE /api/accounts/:id - Delete (deactivate) an account
router.delete(
  "/:id",
  requireAccountAccess,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    if (demoAccountService.isDemoAccountId(id)) {
      return res.status(403).json({ error: "Cannot delete demo account" });
    }

    const success = await deleteAccount(id);

    if (!success) {
      return res.status(404).json({ error: "Account not found" });
    }

    return res.json({
      success: true,
      message: "Account deleted successfully",
    });
  })
);

export default router;
