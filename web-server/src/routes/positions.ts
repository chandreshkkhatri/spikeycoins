import { Router, Response } from "express";
import { requireAuth, requireAccountAccess, AuthenticatedRequest } from "../lib/auth-middleware";
import { asyncHandler } from "../lib/async-handler";
import { BrokerFactory } from "../lib/broker-factory";
import { formatPosition } from "../lib/format-utils";

const router: Router = Router();

// In-memory response cache (10s TTL) to deduplicate rapid requests
const POSITIONS_RESPONSE_CACHE = new Map<string, { promise: Promise<any>; timestamp: number }>();
const POSITIONS_CACHE_TTL = 10_000;

const setNoCacheHeaders = (response: Response) => {
  response.set({
    "Cache-Control": "no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  });
  response.set("ETag", Date.now().toString());
};

// GET /api/positions - Get positions for an account
router.get(
  "/",
  requireAuth,
  requireAccountAccess,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    setNoCacheHeaders(res);

    const account = req.account!;
    const cacheKey = `positions-${account._id}`;
    
    // Clean up old cached entries
    const now = Date.now();
    for (const [k, v] of POSITIONS_RESPONSE_CACHE.entries()) {
      if (now - v.timestamp > POSITIONS_CACHE_TTL) {
        POSITIONS_RESPONSE_CACHE.delete(k);
      }
    }

    const cached = POSITIONS_RESPONSE_CACHE.get(cacheKey);
    if (cached) {
      const data = await cached.promise;
      return res.json(data);
    }

    const fetchPromise = (async () => {
      let positions;
      let tradingSegment: string | undefined;

      if (account.accountType === "kite") {
        if (!account.accessToken) {
          throw new Error("Account not authenticated:kite");
        }
        const kiteClient = BrokerFactory.getKiteClient(account);
        positions = await kiteClient.getPositions();
      } else if (account.accountType === "upstox") {
        if (!account.accessToken) {
          throw new Error("Account not authenticated:upstox");
        }
        const upstoxClient = BrokerFactory.getUpstoxClient(account);
        try {
          positions = await upstoxClient.getPositions();
        } catch (upstoxError: any) {
          // Handle Upstox SDK error
          console.warn(
            "Upstox SDK error (known superagent issue):",
            upstoxError.message,
          );
          positions = [];
        }
      } else if (account.accountType === "binance") {
        tradingSegment = account.metadata?.tradingSegment || "spot";
        const binanceClient = BrokerFactory.getBinanceClient(account);

        if (tradingSegment === "usdm") {
          // USD(S)-M Futures - Get positions
          positions = await binanceClient.getFuturesPositions();
        } else {
          // Spot trading doesn't have positions in the traditional sense
          positions = [];
        }
      } else {
        throw new Error("Unsupported account type for positions");
      }

      // Map positions to unified format
      const unifiedPositions = Array.isArray(positions)
        ? positions.map((position: any) =>
            formatPosition(account, position, { tradingSegment }),
          )
        : [];

      return {
        success: true,
        data: unifiedPositions,
        accountType: account.accountType,
      };
    })();

    // Store promise in cache
    POSITIONS_RESPONSE_CACHE.set(cacheKey, { promise: fetchPromise, timestamp: Date.now() });

    try {
      const responseData = await fetchPromise;
      return res.json(responseData);
    } catch (error: any) {
      // Clean up cache immediately on failure
      POSITIONS_RESPONSE_CACHE.delete(cacheKey);
      throw error;
    }
  })
);

export default router;
