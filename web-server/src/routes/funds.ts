import { Router, Response } from "express";
import kiteConnectService from "../lib/kiteconnect-service";
import upstoxService from "../lib/upstox-service";
import { BinanceService } from "../lib/binance-service";
import { requireAuth, requireAccountAccess, AuthenticatedRequest } from "../lib/auth-middleware";
import { asyncHandler } from "../lib/async-handler";

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

      const unifiedFunds: Record<string, unknown> = { details: funds };
      
      if (funds.segment === "spot") {
        let calcTotalBalance = 0;
        let calcAvailableBalance = 0;
        
        try {
          const { default: MarketOverviewService } = await import("../crypto/services/MarketOverviewService");
          const marketData = MarketOverviewService.getInstance().getCachedData();
          const cryptocache = marketData?.cryptocurrencies || [];
          
          for (const b of funds.balances) {
            const free = parseFloat(b.free);
            const locked = parseFloat(b.locked);
            const total = free + locked;
            
            if (b.asset === "USDT" || b.asset === "USDC" || b.asset === "BUSD") {
              calcTotalBalance += total;
              calcAvailableBalance += free;
            } else {
              const crypto = cryptocache.find(c => c.symbol === b.asset);
              if (crypto) {
                calcTotalBalance += total * crypto.price;
                calcAvailableBalance += free * crypto.price;
              }
            }
          }
        } catch (e) {
          console.warn("Could not calculate spot balance values", e);
        }

        unifiedFunds.totalBalance = calcTotalBalance.toFixed(2);
        unifiedFunds.availableBalance = calcAvailableBalance.toFixed(2);
        unifiedFunds.usedMargin = undefined;
        unifiedFunds.unrealizedPnl = "0.00";
      } else {
        unifiedFunds.totalBalance =
          funds.equity?.available_margin || funds.totalMarginBalance || "0";
        unifiedFunds.availableBalance =
          funds.equity?.available_margin || funds.availableBalance || "0";
        unifiedFunds.usedMargin =
          funds.equity?.used_margin || funds.totalInitialMargin || undefined;
        unifiedFunds.unrealizedPnl =
          funds.equity?.unrealised_pnl ||
          funds.totalUnrealizedProfit ||
          undefined;
      }

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
