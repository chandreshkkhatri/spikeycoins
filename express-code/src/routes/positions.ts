import { Router, Request, Response } from "express";
import kiteConnectService from "../lib/kiteconnect-service";
import upstoxService from "../lib/upstox-service";
import binanceService from "../lib/binance-service";
import { getAccountById } from "../models/account";

const router = Router();

// GET /api/positions - Get positions for an account
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

    let positions;

    if (account.accountType === "kite") {
      if (!account.accessToken) {
        return res.status(401).json({ error: "Account not authenticated" });
      }
      kiteConnectService.initializeWithCredentials(
        account.apiKey,
        account.apiSecret
      );
      kiteConnectService.setAccessToken(account.accessToken);
      positions = await kiteConnectService.getPositions();
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
        positions = await upstoxService.getPositions();
      } catch (upstoxError: any) {
        // Handle Upstox SDK superagent bug - return empty array for now
        console.warn(
          "Upstox SDK error (known superagent issue):",
          upstoxError.message
        );
        positions = [];
      }
    } else if (account.accountType === "binance") {
      const tradingSegment = account.metadata?.tradingSegment || "spot";
      const isTestnet = account.metadata?.testnet || false;

      binanceService.initializeWithCredentials(
        account.apiKey,
        account.apiSecret,
        isTestnet
      );

      if (tradingSegment === "usdm") {
        // USD(S)-M Futures - Get positions
        positions = await binanceService.getFuturesPositions();
      } else {
        // Spot trading doesn't have positions in the traditional sense
        // Return empty array for spot accounts
        positions = [];
      }
    } else {
      return res
        .status(400)
        .json({ error: "Unsupported account type for positions" });
    }

    // Map positions to unified format
    const unifiedPositions = Array.isArray(positions)
      ? positions.map((position: any) => ({
          ...position,
          accountId: account._id,
          vendor: account.accountType,
        }))
      : [];

    return res.json({
      success: true,
      data: unifiedPositions,
      accountType: account.accountType,
    });
  } catch (error: any) {
    console.error("Error fetching positions:", error);
    // Return consistent structure even on error
    return res.status(500).json({
      success: false,
      error: "Failed to fetch positions",
      details: error.message,
      data: [], // Ensure data is always present
    });
  }
});

export default router;
