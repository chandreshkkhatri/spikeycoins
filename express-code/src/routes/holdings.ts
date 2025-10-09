import { Router, Request, Response } from "express";
import kiteConnectService from "../lib/kiteconnect-service";
import upstoxService from "../lib/upstox-service";
import binanceService from "../lib/binance-service";
import { getAccountById } from "../models/account";

const router = Router();

// GET /api/holdings - Get holdings for an account
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

    let holdings;

    if (account.accountType === "kite") {
      if (!account.accessToken) {
        return res.status(401).json({ error: "Account not authenticated" });
      }
      kiteConnectService.initializeWithCredentials(
        account.apiKey,
        account.apiSecret
      );
      kiteConnectService.setAccessToken(account.accessToken);
      holdings = await kiteConnectService.getHoldings();
    } else if (account.accountType === "upstox") {
      if (!account.accessToken) {
        return res.status(401).json({ error: "Account not authenticated" });
      }
      const isSandbox = account.metadata?.sandbox || false;
      upstoxService.initializeWithCredentials(
        account.apiKey,
        account.apiSecret,
        isSandbox
      );
      upstoxService.setAccessToken(account.accessToken);

      try {
        holdings = await upstoxService.getHoldings();
      } catch (upstoxError: any) {
        // Handle Upstox SDK superagent bug - return empty array for now
        console.warn(
          "Upstox SDK error (known superagent issue):",
          upstoxError.message
        );
        holdings = [];
      }
    } else if (account.accountType === "binance") {
      const tradingSegment = account.metadata?.tradingSegment || "spot";
      const isTestnet = account.metadata?.testnet || false;

      binanceService.initializeWithCredentials(
        account.apiKey,
        account.apiSecret,
        isTestnet
      );

      if (tradingSegment === "spot") {
        // Spot - Get balances (holdings in crypto terms)
        holdings = await binanceService.getSpotBalances();
      } else {
        // USD(S)-M Futures - Holdings concept doesn't apply
        // Return empty array for futures accounts
        holdings = [];
      }
    } else {
      return res
        .status(400)
        .json({ error: "Unsupported account type for holdings" });
    }

    // Map holdings to unified format
    const unifiedHoldings = Array.isArray(holdings)
      ? holdings.map((holding: any) => ({
          ...holding,
          accountId: account._id,
          vendor: account.accountType,
        }))
      : [];

    return res.json({
      success: true,
      data: unifiedHoldings,
      accountType: account.accountType,
    });
  } catch (error: any) {
    console.error("Error fetching holdings:", error);
    // Return consistent structure even on error
    return res.status(500).json({
      success: false,
      error: "Failed to fetch holdings",
      details: error.message,
      data: [], // Ensure data is always present
    });
  }
});

export default router;
