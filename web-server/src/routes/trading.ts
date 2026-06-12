import { Router, Response } from "express";
import { requireAuth, requireAccountAccess, AuthenticatedRequest } from "../lib/auth-middleware";
import { asyncHandler } from "../lib/async-handler";
import { BrokerFactory } from "../lib/broker-factory";
import { formatPosition, toNumber } from "../lib/format-utils";

const router: Router = Router();

// ============================================================================
// In-Memory Response Cache (deduplicates rapid requests from multiple tabs)
// ============================================================================
interface CachedResponse {
  promise: Promise<any>;
  timestamp: number;
}
const SUMMARY_RESPONSE_CACHE = new Map<string, CachedResponse>();
const SUMMARY_CACHE_TTL = 10_000; // 10 seconds

function getCachedSummary(key: string): Promise<any> | null {
  const cached = SUMMARY_RESPONSE_CACHE.get(key);
  if (cached && Date.now() - cached.timestamp < SUMMARY_CACHE_TTL) {
    return cached.promise;
  }
  SUMMARY_RESPONSE_CACHE.delete(key);
  return null;
}

function setCachedSummary(key: string, promise: Promise<any>): void {
  SUMMARY_RESPONSE_CACHE.set(key, { promise, timestamp: Date.now() });
  if (SUMMARY_RESPONSE_CACHE.size > 100) {
    const now = Date.now();
    for (const [k, v] of SUMMARY_RESPONSE_CACHE) {
      if (now - v.timestamp > SUMMARY_CACHE_TTL) {
        SUMMARY_RESPONSE_CACHE.delete(k);
      }
    }
  }
}

// GET /api/trading/summary - Aggregated endpoint for all trading data
router.get(
  "/summary",
  requireAuth,
  requireAccountAccess,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { symbol } = req.query;
    const account = req.account!;

    // Check in-memory cache first
    const cacheKey = `summary-${account._id}-${symbol || ""}`;
    const cached = getCachedSummary(cacheKey);
    if (cached) {
      res.set({
        "Cache-Control": "private, max-age=5, stale-while-revalidate=10",
        "X-Cache": "HIT",
      });
      return res.json(cached);
    }

    const fetchPromise = (async () => {
      const response: {
        success: boolean;
        positions: any[];
        orders: any[];
        accountDetails: any | null;
        symbolInfo: any | null;
        accountType: string;
      } = {
        success: true,
        positions: [],
        orders: [],
        accountDetails: null,
        symbolInfo: null,
        accountType: account.accountType,
      };

      if (account.accountType === "binance") {
        const tradingSegment = account.metadata?.tradingSegment || "spot";

        const binanceService = BrokerFactory.getBinanceClient(account);

        if (tradingSegment === "usdm") {
          const [
            accountInfo,
            positions,
            basicOrders,
            algoOrders,
            exchangeInfo,
            leverageBrackets,
          ] = await Promise.all([
            binanceService.getFuturesAccount(),
            binanceService.getFuturesPositions(),
            binanceService.getFuturesOpenOrders(),
            binanceService.getFuturesOpenAlgoOrders(),
            symbol ? binanceService.getFuturesExchangeInfo() : Promise.resolve(null),
            symbol ? binanceService.getFuturesLeverageBrackets(symbol as string) : Promise.resolve(null),
          ]);

          const totalMaintMargin = parseFloat(accountInfo.totalMaintMargin);
          const totalMarginBalance = parseFloat(accountInfo.totalMarginBalance);
          const availableBalance = parseFloat(accountInfo.availableBalance);
          const totalUnrealizedProfit = parseFloat(accountInfo.totalUnrealizedProfit);

          response.accountDetails = {
            equity: totalMarginBalance,
            availableBalance,
            totalMargin: totalMaintMargin,
            unrealizedPnl: totalUnrealizedProfit,
          };

          response.positions = (positions || [])
            .filter((p: any) => Math.abs(toNumber(p.positionAmt)) > 0)
            .map((p: any) => formatPosition(account, p, { tradingSegment }));

          const normalizedBasic = (basicOrders || []).map((o: any) => ({
            ...o,
            id: o.orderId?.toString(),
            orderCategory: "basic",
            accountId: account._id,
            vendor: account.accountType,
          }));

          const normalizedAlgo = (algoOrders || []).map((o: any) => ({
            id: o.algoId?.toString(),
            orderId: o.algoId,
            clientOrderId: o.clientAlgoId,
            symbol: o.symbol,
            side: o.side,
            type: o.orderType,
            origQty: o.quantity,
            price: o.price || "0",
            stopPrice: o.triggerPrice || o.stopPrice,
            status: o.algoStatus,
            time: o.createTime,
            updateTime: o.updateTime,
            orderCategory: "conditional",
            accountId: account._id,
            vendor: account.accountType,
          }));

          response.orders = [...normalizedBasic, ...normalizedAlgo];

          if (symbol && exchangeInfo) {
            const symbolData = exchangeInfo.symbols?.find(
              (s: any) => s.symbol === symbol
            );
            if (symbolData) {
              const priceFilter = symbolData.filters?.find(
                (f: any) => f.filterType === "PRICE_FILTER"
              );
              const lotSizeFilter = symbolData.filters?.find(
                (f: any) => f.filterType === "LOT_SIZE"
              );
              const minNotionalFilter = symbolData.filters?.find(
                (f: any) => f.filterType === "MIN_NOTIONAL"
              );

              let maxLeverage = 125;
              if (leverageBrackets && Array.isArray(leverageBrackets) && leverageBrackets.length > 0) {
                maxLeverage = leverageBrackets[0]?.initialLeverage || 125;
              }

              response.symbolInfo = {
                tickSize: priceFilter?.tickSize || "0.01",
                stepSize: lotSizeFilter?.stepSize || "0.001",
                minQty: parseFloat(lotSizeFilter?.minQty || "0"),
                minNotional: parseFloat(minNotionalFilter?.notional || minNotionalFilter?.minNotional || "0"),
                maxLeverage,
              };
            }
          }
        } else {
          const [accountInfo, spotOrders] = await Promise.all([
            binanceService.getSpotAccount(),
            binanceService.getSpotOpenOrders(),
          ]);

          const usdtBalance = accountInfo.balances?.find(
            (b: any) => b.asset === "USDT"
          );
          response.accountDetails = {
            equity: parseFloat(usdtBalance?.free || "0") + parseFloat(usdtBalance?.locked || "0"),
            availableBalance: parseFloat(usdtBalance?.free || "0"),
          };

          response.orders = (spotOrders || []).map((o: any) => ({
            ...o,
            id: o.orderId?.toString(),
            orderCategory: "basic",
            accountId: account._id,
            vendor: account.accountType,
          }));

          response.positions = [];
        }
      } else if (account.accountType === "kite") {
        if (!account.accessToken) {
          throw new Error("Account not authenticated");
        }
        const kiteClient = BrokerFactory.getKiteClient(account);

        const [positions, orders, margins] = await Promise.all([
          kiteClient.getPositions(),
          kiteClient.getOrders(),
          kiteClient.getMargins(),
        ]);

        response.positions = (positions || []).map((p: any) => formatPosition(account, p));

        response.orders = (orders || []).map((o: any) => ({
          ...o,
          accountId: account._id,
          vendor: account.accountType,
        }));

        const equity = margins?.equity || {};
        response.accountDetails = {
          equity: equity.net || 0,
          availableBalance: equity.available?.cash || equity.available?.live_balance || 0,
        };
      } else if (account.accountType === "upstox") {
        if (!account.accessToken) {
          throw new Error("Account not authenticated");
        }
        const upstoxClient = BrokerFactory.getUpstoxClient(account);

        try {
          const [positions, orders, funds] = await Promise.all([
            upstoxClient.getPositions().catch(() => []),
            upstoxClient.getOrders().catch(() => []),
            upstoxClient.getFunds().catch(() => null),
          ]);

          response.positions = (positions || []).map((p: any) => formatPosition(account, p));

          response.orders = (orders || []).map((o: any) => ({
            ...o,
            accountId: account._id,
            vendor: account.accountType,
          }));

          if (funds) {
            response.accountDetails = {
              equity: parseFloat(funds.equity || "0"),
              availableBalance: parseFloat(funds.available_margin || "0"),
            };
          }
        } catch (upstoxError: any) {
          console.warn("Upstox SDK error:", upstoxError.message);
        }
      } else {
        throw new Error("Unsupported account type");
      }

      return response;
    })();

    setCachedSummary(cacheKey, fetchPromise);

    try {
      const result = await fetchPromise;
      res.set({
        "Cache-Control": "private, max-age=5, stale-while-revalidate=10",
      });
      return res.json(result);
    } catch (error: any) {
      SUMMARY_RESPONSE_CACHE.delete(cacheKey);
      throw error;
    }
  })
);

// Deprecated placeholder endpoints (requiring requireAuth to be secure)
router.get(
  "/orders",
  requireAuth,
  asyncHandler(async (req, res) => {
    return res.json({
      success: true,
      orders: [],
      message: "Use /api/trading/summary for aggregated data",
    });
  })
);

router.get(
  "/positions",
  requireAuth,
  asyncHandler(async (req, res) => {
    return res.json({
      success: true,
      positions: [],
      message: "Use /api/trading/summary for aggregated data",
    });
  })
);

router.get(
  "/holdings",
  requireAuth,
  asyncHandler(async (req, res) => {
    return res.json({
      success: true,
      holdings: [],
      message: "Use /api/trading/summary for aggregated data",
    });
  })
);

export default router;
