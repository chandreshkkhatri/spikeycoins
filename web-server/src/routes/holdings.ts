import { Router, Request, Response } from "express";
import kiteConnectService from "../lib/kiteconnect-service";
import upstoxService from "../lib/upstox-service";
import { BinanceService } from "../lib/binance-service";
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
        account.apiSecret,
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
        isSandbox,
      );
      upstoxService.setAccessToken(account.accessToken);

      try {
        holdings = await upstoxService.getHoldings();
      } catch (upstoxError: any) {
        // Handle Upstox SDK superagent bug - return empty array for now
        console.warn(
          "Upstox SDK error (known superagent issue):",
          upstoxError.message,
        );
        holdings = [];
      }
    } else if (account.accountType === "binance") {
      const isTestnet = account.metadata?.testnet || false;

      const binanceService = new BinanceService();
      binanceService.initializeWithCredentials(
        account.apiKey,
        account.apiSecret,
        isTestnet,
      );

      // Always fetch spot balances for holdings regardless of trading segment metadata
      holdings = await binanceService.getSpotBalances();
    } else {
      return res
        .status(400)
        .json({ error: "Unsupported account type for holdings" });
    }

    // Map holdings to unified format
    const unifiedHoldings = Array.isArray(holdings)
      ? holdings.map((holding: any) => {
          // Transform Binance balance format to unified holding format
          if (account.accountType === "binance") {
            const free = parseFloat(holding.free || 0);
            const locked = parseFloat(holding.locked || 0);
            const quantity = free + locked;

            return {
              id: `${account._id}-${holding.asset}`,
              symbol: holding.asset, // BTC, ETH, USDT, etc.
              exchange: "SPOT",
              quantity: quantity,
              averagePrice: 0, // Binance doesn't provide avg price in balance endpoint
              lastPrice: 0, // Would need to fetch from ticker
              currentValue: 0,
              pnl: 0,
              pnlPercentage: 0,
              vendor: account.accountType,
              accountId: account._id,
              accountName: account.accountName,
              timestamp: new Date().toISOString(),
              details: {
                free: free,
                locked: locked,
                asset: holding.asset,
              },
            };
          }

          // For other vendors, pass through with vendor info
          return {
            ...holding,
            accountId: account._id,
            accountName: account.accountName,
            vendor: account.accountType,
          };
        })
      : [];

    return res.json({
      success: true,
      data: unifiedHoldings,
      accountType: account.accountType,
    });
  } catch (error: any) {
    console.error("Error fetching holdings:", error);
    // Return consistent structure even on error
    // Include actual error message for better debugging
    const errorMessage = error.message || "Unknown error";
    return res.status(500).json({
      success: false,
      error: `Failed to fetch holdings: ${errorMessage}`,
      details: errorMessage,
      data: [], // Ensure data is always present
    });
  }
});

export default router;
