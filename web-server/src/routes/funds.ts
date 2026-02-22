import { Router, Request, Response } from "express";
import kiteConnectService from "../lib/kiteconnect-service";
import upstoxService from "../lib/upstox-service";
import { BinanceService } from "../lib/binance-service";
import { getAccountById } from "../models/account";
import { demoAccountService } from "../lib/demo-account-service";

const router: Router = Router();

// In-memory response cache (10s TTL) to deduplicate rapid requests
const FUNDS_RESPONSE_CACHE = new Map<string, { promise: Promise<any>; timestamp: number }>();
const FUNDS_CACHE_TTL = 10_000;

// GET /api/funds - Get funds/margins for an account
router.get("/", async (req: Request, res: Response) => {
  try {
    const { accountId } = req.query;

    if (!accountId) {
      return res.status(400).json({ error: "accountId is required" });
    }

    // Check in-memory promise cache first
    const cacheKey = `funds-${accountId}`;
    
    // Clean up old entries
    const now = Date.now();
    for (const [k, v] of FUNDS_RESPONSE_CACHE.entries()) {
      if (now - v.timestamp > FUNDS_CACHE_TTL) {
        FUNDS_RESPONSE_CACHE.delete(k);
      }
    }

    const cached = FUNDS_RESPONSE_CACHE.get(cacheKey);
    if (cached) {
      const data = await cached.promise;
      return res.json(data);
    }

    const fetchPromise = (async () => {
      let account;
      if (demoAccountService.isDemoAccountId(accountId as string)) {
        account = demoAccountService.getDemoAccount(true);
        if (!account) {
          throw new Error("Demo account not configured");
        }
      } else {
        account = await getAccountById(accountId as string);
        if (!account) {
          throw new Error("Account not found");
        }
      }

      let funds;

      if (account.accountType === "kite") {
        if (!account.accessToken) {
          throw new Error("Account not authenticated:kite");
        }
        kiteConnectService.initializeWithCredentials(
          account.apiKey,
          account.apiSecret,
        );
        kiteConnectService.setAccessToken(account.accessToken);
        funds = await kiteConnectService.getMargins();
      } else if (account.accountType === "upstox") {
        if (!account.accessToken) {
          throw new Error("Account not authenticated:upstox");
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
        const tradingSegment = account.metadata?.tradingSegment || "spot";
        const isTestnet = account.metadata?.testnet || false;

        const binanceService = new BinanceService();
        binanceService.initializeWithCredentials(
          account.apiKey,
          account.apiSecret,
          isTestnet,
        );

        if (tradingSegment === "usdm") {
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
        throw new Error("Unsupported account type for funds");
      }

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

      return {
        success: true,
        funds: unifiedFunds,
        accountType: account.accountType,
      };
    })();

    // Store promise in cache
    FUNDS_RESPONSE_CACHE.set(cacheKey, { promise: fetchPromise, timestamp: Date.now() });

    try {
      const responseData = await fetchPromise;
      return res.json(responseData);
    } catch (error: any) {
      // If the promise fails, remove it from cache immediately so retries work
      FUNDS_RESPONSE_CACHE.delete(cacheKey);
      throw error;
    }
  } catch (error: any) {
    console.error("Error fetching funds:", error);
    
    // Handle specific auth errors mapped from exceptions
    if (error.message?.includes("Account not authenticated") || error.message === "Account not found") {
      const status = error.message === "Account not found" ? 404 : 401;
      return res.status(status).json({
        error: error.message.split(":")[0],
        details: error.message,
      });
    }

    return res.status(500).json({
      error: "Failed to fetch funds",
      details: error.message,
    });
  }
});

export default router;
