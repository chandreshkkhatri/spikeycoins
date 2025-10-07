import { Router, Request, Response } from "express";
import kiteConnectService from "../lib/kiteconnect-service";
import upstoxService from "../lib/upstox-service";
import { getAccountById } from "../models/account";

const router = Router();

// GET /api/funds - Get funds/margins for an account
router.get("/", async (req: Request, res: Response) => {
  try {
    const { accountId } = req.query;

    if (!accountId) {
      return res.status(400).json({ error: "accountId is required" });
    }

    const account = await getAccountById(accountId as string);

    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    if (!account.accessToken) {
      return res.status(401).json({ error: "Account not authenticated" });
    }

    let funds;

    if (account.accountType === "kite") {
      kiteConnectService.initializeWithCredentials(
        account.apiKey,
        account.apiSecret
      );
      kiteConnectService.setAccessToken(account.accessToken);
      funds = await kiteConnectService.getMargins();
    } else if (account.accountType === "upstox") {
      const isSandbox = account.metadata?.sandbox || false;
      upstoxService.initializeWithCredentials(
        account.apiKey,
        account.apiSecret,
        isSandbox
      );
      upstoxService.setAccessToken(account.accessToken);
      funds = await upstoxService.getFunds();
    } else {
      return res
        .status(400)
        .json({ error: "Unsupported account type for funds" });
    }

    return res.json({
      success: true,
      funds,
      accountType: account.accountType,
    });
  } catch (error: any) {
    console.error("Error fetching funds:", error);
    return res.status(500).json({
      error: "Failed to fetch funds",
      details: error.message,
    });
  }
});

export default router;
