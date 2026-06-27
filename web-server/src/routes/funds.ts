import { Router, Response } from "express";
import { requireAuth, requireAccountAccess, AuthenticatedRequest } from "../lib/auth-middleware";
import { asyncHandler } from "../lib/async-handler";
import { BrokerFactory } from "../lib/broker-factory";
import { formatFunds } from "../lib/format-utils";

const router: Router = Router();

// In-memory response cache (10s TTL) to deduplicate rapid requests
const FUNDS_RESPONSE_CACHE = new Map<string, { promise: Promise<any>; timestamp: number }>();
const FUNDS_CACHE_TTL = 10_000;

// GET /api/funds - Get funds/margins for an account
router.get(
  "/",
  requireAuth,
  requireAccountAccess,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const account = req.account!;
    const cacheKey = `funds-${account._id}`;
    
    // Clean up old cached entries
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
      let funds;

      if (account.accountType === "upstox") {
        if (!account.accessToken) {
          throw new Error("Account not authenticated:upstox");
        }
        const upstoxClient = BrokerFactory.getUpstoxClient(account);
        funds = await upstoxClient.getFunds();
      } else if (account.accountType === "binance") {
        const tradingSegment = account.metadata?.tradingSegment || "spot";
        const binanceService = BrokerFactory.getBinanceClient(account);

        // Retry helper for Binance API calls
        const withRetry = async <T>(fn: () => Promise<T>, retries = 2, delayMs = 1000): Promise<T> => {
          for (let attempt = 0; attempt <= retries; attempt++) {
            try {
              return await fn();
            } catch (err: any) {
              const isLastAttempt = attempt === retries;
              const isRetryable = !err.message?.includes('Rate limited') &&
                !err.message?.includes('recvWindow') &&
                err.status !== 401 && err.status !== 403;
              if (isLastAttempt || !isRetryable) throw err;
              console.warn(`[Funds] Binance API attempt ${attempt + 1} failed, retrying in ${delayMs}ms:`, err.message);
              await new Promise(r => setTimeout(r, delayMs * (attempt + 1)));
            }
          }
          throw new Error('Unreachable');
        };

        if (tradingSegment === "usdm") {
          const futuresAccount = await withRetry(() => binanceService.getFuturesAccount());
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
          const spotAccount = await withRetry(() => binanceService.getSpotAccount());
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

      let cryptocurrencies: any[] = [];
      if (funds.segment === "spot") {
        try {
          const { default: MarketOverviewService } = await import("../crypto/services/MarketOverviewService");
          const marketData = MarketOverviewService.getInstance().getCachedData();
          cryptocurrencies = marketData?.cryptocurrencies || [];
        } catch (e) {
          console.warn("Could not calculate spot balance values", e);
        }
      }

      const unifiedFunds = formatFunds(funds, account, cryptocurrencies);

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
      // Clean up cache immediately on failure
      FUNDS_RESPONSE_CACHE.delete(cacheKey);
      throw error;
    }
  })
);

export default router;
