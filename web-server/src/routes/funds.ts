import { Router, Request, Response } from "express";
import kiteConnectService from "../lib/kiteconnect-service";
import upstoxService from "../lib/upstox-service";
import { BinanceService } from "../lib/binance-service";
import { getAccountById } from "../models/account";
import { demoAccountService } from "../lib/demo-account-service";

const router: Router = Router();

// In-memory response cache (10s TTL) to deduplicate rapid requests
const FUNDS_RESPONSE_CACHE = new Map<string, { data: unknown; timestamp: number }>();
const FUNDS_CACHE_TTL = 10_000;

// GET /api/funds - Get funds/margins for an account
router.get("/", async (req: Request, res: Response) => {
  try {
    const { accountId } = req.query;

    if (!accountId) {
      return res.status(400).json({ error: "accountId is required" });
    }

    // Check in-memory cache first
    const cacheKey = `funds-${accountId}`;
    const cached = FUNDS_RESPONSE_CACHE.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < FUNDS_CACHE_TTL) {
      return res.json(cached.data);
    }

    let account;
    if (demoAccountService.isDemoAccountId(accountId as string)) {
      account = demoAccountService.getDemoAccount(true);
      if (!account) {
        return res.status(500).json({ error: "Demo account not configured" });
      }
    } else {
      account = await getAccountById(accountId as string);
      if (!account) {
        return res.status(404).json({ error: "Account not found" });
      }
    }

    let funds;

    if (account.accountType === "kite") {
      if (!account.accessToken) {
        return res.status(401).json({ error: "Account not authenticated" });
      }
      kiteConnectService.initializeWithCredentials(
        account.apiKey,
        account.apiSecret,
      );
      kiteConnectService.setAccessToken(account.accessToken);
      funds = await kiteConnectService.getMargins();
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
      funds = await upstoxService.getFunds();
    } else if (account.accountType === "binance") {
      // Binance doesn't require separate accessToken - API Key/Secret is sufficient
      const tradingSegment = account.metadata?.tradingSegment || "spot";
      const isTestnet = account.metadata?.testnet || false;

      // Instantiate service for this request
      const binanceService = new BinanceService();
      binanceService.initializeWithCredentials(
        account.apiKey,
        account.apiSecret,
        isTestnet,
      );

      if (tradingSegment === "usdm") {
        // USD(S)-M Futures - Get futures balance
        const futuresAccount = await binanceService.getFuturesAccount();
        funds = {
          segment: "usdm",
          totalWalletBalance: futuresAccount.totalWalletBalance,
          totalUnrealizedProfit: futuresAccount.totalUnrealizedProfit,
          totalMarginBalance: futuresAccount.totalMarginBalance,
          availableBalance: futuresAccount.availableBalance,
          maxWithdrawAmount: futuresAccount.maxWithdrawAmount,
          assets: futuresAccount.assets,
          positions: futuresAccount.positions,
        };
      } else {
        // Spot - Get spot balances
        const spotAccount = await binanceService.getSpotAccount();
        funds = {
          segment: "spot",
          canTrade: spotAccount.canTrade,
          canWithdraw: spotAccount.canWithdraw,
          canDeposit: spotAccount.canDeposit,
          balances: spotAccount.balances.filter(
            (b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0,
          ),
        };
      }
    } else {
      return res
        .status(400)
        .json({ error: "Unsupported account type for funds" });
    }

    // Format funds data with unified structure
    const unifiedFunds = {
      totalBalance:
        funds.equity?.available_margin || funds.totalMarginBalance || "0",
      availableBalance:
        funds.equity?.available_margin || funds.availableBalance || "0",
      usedMargin:
        funds.equity?.used_margin || funds.totalInitialMargin || undefined,
      unrealizedPnl:
        funds.equity?.unrealised_pnl ||
        funds.totalUnrealizedProfit ||
        undefined,
      details: funds,
    };

    const responseData = {
      success: true,
      funds: unifiedFunds,
      accountType: account.accountType,
    };

    // Cache the response
    FUNDS_RESPONSE_CACHE.set(cacheKey, { data: responseData, timestamp: Date.now() });

    return res.json(responseData);
  } catch (error: any) {
    console.error("Error fetching funds:", error);
    return res.status(500).json({
      error: "Failed to fetch funds",
      details: error.message,
    });
  }
});

export default router;
