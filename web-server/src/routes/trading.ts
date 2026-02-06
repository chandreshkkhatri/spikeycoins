import { Router, Request, Response } from "express";
import kiteConnectService from "../lib/kiteconnect-service";
import upstoxService from "../lib/upstox-service";
import { BinanceService } from "../lib/binance-service";
import { getAccountById, IAccount } from "../models/account";
import { demoAccountService } from "../lib/demo-account-service";

const router: Router = Router();

// Helper to convert values to numbers safely
const toNumber = (value: unknown, fallback: number = 0): number => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
};

// Format Binance futures position
const formatBinanceFuturesPosition = (position: any, account: IAccount) => {
  const quantity = toNumber(position.positionAmt, 0);
  const averagePrice = toNumber(position.entryPrice, 0);
  const lastPrice = toNumber(position.markPrice, averagePrice); // Fallback to entry if mark not available
  const pnl = toNumber(position.unRealizedProfit, 0);
  const notional = Math.abs(quantity * averagePrice);
  const pnlPercentage = notional > 0 ? (pnl / notional) * 100 : 0;
  const symbol = position.symbol || "UNKNOWN_SYMBOL";
  const liquidationPrice = toNumber(position.liquidationPrice, 0);
  const initialMargin = toNumber(position.initialMargin, 0);
  const leverage = toNumber(position.leverage, 1); // Default leverage 1 instead of 0

  // Break Even Price calculation (entry price + trading fees)
  const TAKER_FEE = 0.0004;
  const breakEvenPrice =
    quantity > 0
      ? averagePrice * (1 + TAKER_FEE * 2)
      : averagePrice * (1 - TAKER_FEE * 2);

  return {
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
    breakEvenPrice: Number.isFinite(breakEvenPrice) ? breakEvenPrice : averagePrice, // Validate breakEvenPrice
    margin: initialMargin,
    marginType: position.marginType,
    product: `Futures (${(position.marginType || "cross").toUpperCase()})`,
    vendor: account.accountType,
    accountId: account._id,
    accountName: account.accountName,
    timestamp: new Date(position.updateTime || Date.now()).toISOString(),
  };
};

// GET /api/trading/summary - Aggregated endpoint for all trading data
// Combines: positions, orders, account details, and symbol info in ONE call
router.get("/summary", async (req: Request, res: Response) => {
  try {
    const { accountId, symbol } = req.query;

    if (!accountId) {
      return res.status(400).json({ error: "accountId is required" });
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

    // Initialize response structure
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
      const isTestnet = account.metadata?.testnet || false;

      const binanceService = new BinanceService();
      binanceService.initializeWithCredentials(
        account.apiKey,
        account.apiSecret,
        isTestnet
      );

      if (tradingSegment === "usdm") {
        // Fetch all data in parallel for maximum efficiency
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

        // Process account details
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

        // Process positions - only non-zero positions
        response.positions = (positions || [])
          .filter((p: any) => Math.abs(toNumber(p.positionAmt)) > 0)
          .map((p: any) => formatBinanceFuturesPosition(p, account));

        // Process orders - combine basic and algo orders
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

        // Process symbol info if symbol provided
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

            // Get max leverage from brackets
            let maxLeverage = 125;
            if (leverageBrackets && Array.isArray(leverageBrackets) && leverageBrackets.length > 0) {
              maxLeverage = leverageBrackets[0]?.initialLeverage || 125;
            }

            response.symbolInfo = {
              tickSize: priceFilter?.tickSize || "0.01",
              stepSize: lotSizeFilter?.stepSize || "0.001",
              minQty: parseFloat(lotSizeFilter?.minQty || "0"),
              minNotional: parseFloat(minNotionalFilter?.minNotional || "0"),
              maxLeverage,
            };
          }
        }
      } else {
        // Spot trading
        const [accountInfo, spotOrders] = await Promise.all([
          binanceService.getSpotAccount(),
          binanceService.getSpotOpenOrders(),
        ]);

        // Process spot account
        const usdtBalance = accountInfo.balances?.find(
          (b: any) => b.asset === "USDT"
        );
        response.accountDetails = {
          equity: parseFloat(usdtBalance?.free || "0") + parseFloat(usdtBalance?.locked || "0"),
          availableBalance: parseFloat(usdtBalance?.free || "0"),
        };

        // Process spot orders
        response.orders = (spotOrders || []).map((o: any) => ({
          ...o,
          id: o.orderId?.toString(),
          orderCategory: "basic",
          accountId: account._id,
          vendor: account.accountType,
        }));

        // Spot doesn't have positions
        response.positions = [];
      }
    } else if (account.accountType === "kite") {
      if (!account.accessToken) {
        return res.status(401).json({ error: "Account not authenticated" });
      }
      kiteConnectService.initializeWithCredentials(
        account.apiKey,
        account.apiSecret
      );
      kiteConnectService.setAccessToken(account.accessToken);

      // Fetch positions and orders in parallel
      const [positions, orders, margins] = await Promise.all([
        kiteConnectService.getPositions(),
        kiteConnectService.getOrders(),
        kiteConnectService.getMargins(),
      ]);

      response.positions = (positions || []).map((p: any) => ({
        ...p,
        accountId: account._id,
        vendor: account.accountType,
      }));

      response.orders = (orders || []).map((o: any) => ({
        ...o,
        accountId: account._id,
        vendor: account.accountType,
      }));

      // Extract available margin
      const equity = margins?.equity || {};
      response.accountDetails = {
        equity: equity.net || 0,
        availableBalance: equity.available?.cash || equity.available?.live_balance || 0,
      };
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

      // Fetch positions and orders in parallel
      try {
        const [positions, orders, funds] = await Promise.all([
          upstoxService.getPositions().catch(() => []),
          upstoxService.getOrders().catch(() => []),
          upstoxService.getFunds().catch(() => null),
        ]);

        response.positions = (positions || []).map((p: any) => ({
          ...p,
          accountId: account._id,
          vendor: account.accountType,
        }));

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
        // Return empty arrays for Upstox on error
      }
    } else {
      return res.status(400).json({ error: "Unsupported account type" });
    }

    // Set cache headers - allow 5 second cache for aggregated data
    res.set({
      "Cache-Control": "private, max-age=5, stale-while-revalidate=10",
    });

    return res.json(response);
  } catch (error: any) {
    console.error("Error fetching trading summary:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch trading summary",
      details: error.message,
    });
  }
});

// Legacy placeholder endpoints (to be deprecated)
router.get("/orders", async (req: Request, res: Response) => {
  return res.json({
    success: true,
    orders: [],
    message: "Use /api/trading/summary for aggregated data",
  });
});

router.get("/positions", async (req: Request, res: Response) => {
  return res.json({
    success: true,
    positions: [],
    message: "Use /api/trading/summary for aggregated data",
  });
});

router.get("/holdings", async (req: Request, res: Response) => {
  return res.json({
    success: true,
    holdings: [],
    message: "Use /api/trading/summary for aggregated data",
  });
});

export default router;
