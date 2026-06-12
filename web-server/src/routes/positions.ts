import { Router, Response } from "express";
import kiteConnectService from "../lib/kiteconnect-service";
import upstoxService from "../lib/upstox-service";
import { BinanceService } from "../lib/binance-service";
import { IAccount } from "../models/account";
import { requireAuth, requireAccountAccess, AuthenticatedRequest } from "../lib/auth-middleware";
import { asyncHandler } from "../lib/async-handler";

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

const toNumber = (value: unknown): number => {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  return 0;
};

const formatBinanceFuturesPosition = (position: any, account: IAccount) => {
  const quantity = toNumber(position.positionAmt);
  const averagePrice = toNumber(position.entryPrice);
  const lastPrice = toNumber(position.markPrice);
  const pnl = toNumber(position.unRealizedProfit);
  const notional = Math.abs(quantity * averagePrice);
  const pnlPercentage = notional > 0 ? (pnl / notional) * 100 : 0;
  const symbol =
    position.symbol ||
    position.pair ||
    position.displaySymbol ||
    "UNKNOWN_SYMBOL";

  // Additional fields for futures positions
  const liquidationPrice = toNumber(position.liquidationPrice);
  const initialMargin = toNumber(position.initialMargin); // Margin used by position
  const leverage = toNumber(position.leverage);

  // Break Even Price calculation (entry price + trading fees)
  // Using 0.04% taker fee (entry + exit = 0.08% total)
  const TAKER_FEE = 0.0004;
  const breakEvenPrice =
    quantity > 0
      ? averagePrice * (1 + TAKER_FEE * 2) // Long: entry + 2x fee
      : averagePrice * (1 - TAKER_FEE * 2); // Short: entry - 2x fee

  return {
    ...position,
    id: `${account._id}-${symbol}-${position.positionSide || "BOTH"}`,
    symbol,
    exchange: "BINANCE",
    quantity,
    averagePrice,
    lastPrice,
    pnl,
    pnlPercentage,
    leverage,
    liquidationPrice,
    breakEvenPrice,
    margin: initialMargin,
    marginType: position.marginType,
    product: `Futures (${(position.marginType || "cross").toUpperCase()})`,
    vendor: account.accountType,
    accountId: account._id,
    accountName: account.accountName,
    timestamp: new Date(position.updateTime || Date.now()).toISOString(),
    details: position,
  };
};

const formatDefaultPosition = (position: any, account: IAccount) => {
  const symbol =
    position.symbol ||
    position.tradingsymbol ||
    position.tradingSymbol ||
    position.instrument_token ||
    position.instrumentToken ||
    "UNKNOWN_SYMBOL";

  const quantity =
    position.quantity ??
    position.netQty ??
    position.net_qty ??
    position.netQuantity ??
    position.net_quantity ??
    0;

  const averagePrice =
    position.averagePrice ??
    position.average_price ??
    position.avgPrice ??
    position.avg_price ??
    0;

  const lastPrice =
    position.lastPrice ??
    position.last_price ??
    position.ltp ??
    position.lastTradedPrice ??
    position.last_traded_price ??
    0;

  const pnl =
    position.pnl ??
    position.mtm ??
    position.realizedPnl ??
    position.unrealized ??
    0;

  const pnlPercentage =
    position.pnlPercentage ??
    position.pnl_percentage ??
    (lastPrice && averagePrice
      ? ((lastPrice - averagePrice) / (averagePrice || 1)) * 100
      : 0);

  return {
    id: position.id || `${account._id}-${symbol}`,
    symbol,
    exchange: position.exchange || account.accountType.toUpperCase(),
    quantity,
    averagePrice,
    lastPrice,
    pnl,
    pnlPercentage,
    product:
      position.product ||
      position.productType ||
      position.product_type ||
      "POSITIONS",
    vendor: account.accountType,
    accountId: account._id,
    accountName: account.accountName,
    timestamp:
      position.timestamp ||
      position.lastTradeTime ||
      position.last_trade_time ||
      new Date().toISOString(),
    details: position,
  };
};

const formatPosition = (
  account: IAccount,
  position: any,
  options?: { tradingSegment?: string },
) => {
  if (account.accountType === "binance" && options?.tradingSegment === "usdm") {
    return formatBinanceFuturesPosition(position, account);
  }

  return {
    ...position,
    ...formatDefaultPosition(position, account),
  };
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
        kiteConnectService.initializeWithCredentials(
          account.apiKey,
          account.apiSecret,
        );
        kiteConnectService.setAccessToken(account.accessToken);
        positions = await kiteConnectService.getPositions();
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

        try {
          positions = await upstoxService.getPositions();
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
        const isTestnet = account.metadata?.testnet || false;

        const binanceService = new BinanceService();
        binanceService.initializeWithCredentials(
          account.apiKey,
          account.apiSecret,
          isTestnet,
        );

        if (tradingSegment === "usdm") {
          // USD(S)-M Futures - Get positions
          positions = await binanceService.getFuturesPositions();
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
